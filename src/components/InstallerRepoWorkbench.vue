<template>
	<section
		class="installer-repo-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'OS Installer, Firmware, Package Cache and ISO Distribution Repository Auditor')">
		<header class="irw__toolbar">
			<div class="irw__title-group">
				<h3 class="irw__title">
					{{ t('duplicatefinder', 'OS Installer, Firmware, Package Cache & ISO Distribution Repository Auditor') }}
				</h3>
				<span
					class="irw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} reclaimable / {guarded} golden-guarded', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						guarded: analysis.summary.totalGoldenGuardedClusters,
					}) }}
				</span>
			</div>

			<div class="irw__toolbar-actions">
				<button
					type="button"
					class="irw__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="irw__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="irw__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="irw__tool-btn is-close"
					aria-keyshortcuts="_"
					:title="t('duplicatefinder', 'Hide OS installer, firmware, package cache and ISO auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Installer Repo Auditor') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="irw__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="irw__empty-banner"
			role="note">
			<div class="irw__empty-text">
				<p class="irw__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure golden repository and firmware guards before scanning') }}
				</p>
				<p class="irw__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit duplicated OS ISOs (.iso/.img.xz/.ipsw), desktop installers (.msi/.exe/.dmg/.AppImage), firmware blobs (.rom/.cap/.msu), and OS package caches (.deb/.rpm/.whl/.nupkg) while protecting golden PXE/MDT repositories.') }}
				</p>
			</div>
			<button
				type="button"
				class="irw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="irw__controls">
			<div class="irw__control-row">
				<span class="irw__control-label">{{ t('duplicatefinder', 'Audit Preset') }}</span>
				<div
					class="irw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Installer repository audit presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="irw__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="irw__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="irw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="irw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="irw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="irw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="irw__seg-btn"
					:class="{ 'is-active': protectGoldenRepos }"
					:aria-pressed="protectGoldenRepos ? 'true' : 'false'"
					@click="protectGoldenRepos = !protectGoldenRepos">
					<span>{{ protectGoldenRepos ? t('duplicatefinder', 'Golden Repo Guard: ON') : t('duplicatefinder', 'Golden Repo Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="irw__seg-btn"
					:class="{ 'is-active': protectSignedArtifacts }"
					:aria-pressed="protectSignedArtifacts ? 'true' : 'false'"
					@click="protectSignedArtifacts = !protectSignedArtifacts">
					<span>{{ protectSignedArtifacts ? t('duplicatefinder', 'Signed Artifact Guard: ON') : t('duplicatefinder', 'Signed Artifact Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="irw__seg-btn"
					:class="{ 'is-active': protectFirmwareBlobs }"
					:aria-pressed="protectFirmwareBlobs ? 'true' : 'false'"
					@click="protectFirmwareBlobs = !protectFirmwareBlobs">
					<span>{{ protectFirmwareBlobs ? t('duplicatefinder', 'Firmware Vault Guard: ON') : t('duplicatefinder', 'Firmware Vault Guard: OFF') }}</span>
				</button>
			</div>

			<div class="irw__control-row irw__inputs-row">
				<label class="irw__field">
					<span class="irw__field-label">{{ t('duplicatefinder', 'Action Strategy') }}</span>
					<select v-model="strategy" class="irw__input">
						<option value="consolidate-repo">{{ t('duplicatefinder', 'Consolidate & Purge Redundant Copies') }}</option>
						<option value="hardlink-mirror">{{ t('duplicatefinder', 'Hardlink Repo Mirrors (POSIX ln -f)') }}</option>
						<option value="keep-latest-lts">{{ t('duplicatefinder', 'Keep Golden / Purge Superseded RC & Downloads') }}</option>
					</select>
				</label>

				<label class="irw__field">
					<span class="irw__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="irw__input">
						<option value="golden-repo-first">{{ t('duplicatefinder', 'Golden PXE/MDT repo first') }}</option>
						<option value="signed-or-newest">{{ t('duplicatefinder', 'Signed / non-RC / newest first') }}</option>
						<option value="oldest-golden">{{ t('duplicatefinder', 'Oldest golden vault copy') }}</option>
						<option value="newest-release">{{ t('duplicatefinder', 'Newest release timestamp') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="irw__field">
					<span class="irw__field-label">{{ t('duplicatefinder', 'Stale Downloads (d)') }}</span>
					<input
						v-model="staleDownloadDaysInput"
						type="number"
						min="0"
						step="1"
						class="irw__input irw__num-input">
				</label>

				<label class="irw__field">
					<span class="irw__field-label">{{ t('duplicatefinder', 'Min Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="irw__input irw__num-input">
				</label>

				<label class="irw__field irw__field-grow">
					<span class="irw__field-label">{{ t('duplicatefinder', 'Filter Installer, Arch, Version or Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="irw__input"
						:placeholder="t('duplicatefinder', 'e.g. .iso, arm64, x86_64, ubuntu, .msi, /pxe')">
				</label>

				<label class="irw__field irw__field-grow">
					<span class="irw__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="irw__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="irw__field">
					<span class="irw__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="irw__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Golden & firmware risk') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact name (A-Z)') }}</option>
					</select>
				</label>
			</div>
		</div>

		<div class="irw__kpis">
			<div class="irw__kpi">
				<span class="irw__kpi-label">{{ t('duplicatefinder', 'Safe Installer & ISO Reclaim') }}</span>
				<strong class="irw__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="irw__kpi">
				<span class="irw__kpi-label">{{ t('duplicatefinder', 'Golden & Firmware Shields') }}</span>
				<strong class="irw__kpi-val is-warn">
					{{ analysis.summary.totalGoldenGuardedClusters }} {{ t('duplicatefinder', 'golden') }} / {{ analysis.summary.totalFirmwareClusters }} {{ t('duplicatefinder', 'firmware') }} ({{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }})
				</strong>
			</div>
			<div class="irw__kpi">
				<span class="irw__kpi-label">{{ t('duplicatefinder', 'User Download Sprawl') }}</span>
				<strong class="irw__kpi-val">
					{{ analysis.summary.totalUserDownloadCopiesCount }} {{ t('duplicatefinder', 'copies') }}
				</strong>
			</div>
			<div class="irw__kpi">
				<span class="irw__kpi-label">{{ t('duplicatefinder', 'Raw Distribution Footprint') }}</span>
				<strong class="irw__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty"
			class="irw__filters-strip">
			<div
				class="irw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by installer artifact family')">
				<button
					type="button"
					class="irw__chip"
					:class="{ 'is-active': familyFilter === 'all' }"
					:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
					@click="familyFilter = 'all'">
					<span>{{ t('duplicatefinder', 'All Artifacts ({count})', { count: analysis.summary.familyCounts.all || 0 }) }}</span>
				</button>
				<button
					v-for="familyItem in familyOptions"
					:key="familyItem.id"
					type="button"
					class="irw__chip"
					:class="{ 'is-active': familyFilter === familyItem.id }"
					:aria-pressed="familyFilter === familyItem.id ? 'true' : 'false'"
					@click="familyFilter = familyItem.id">
					<span>{{ familyItem.label }} ({{ analysis.summary.familyCounts[familyItem.id] || 0 }})</span>
				</button>
			</div>

			<div
				class="irw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by audit verdict')">
				<button
					v-for="verdictOpt in verdictFilterOptions"
					:key="verdictOpt.id"
					type="button"
					class="irw__chip"
					:class="{ 'is-active': verdictFilter === verdictOpt.id }"
					:aria-pressed="verdictFilter === verdictOpt.id ? 'true' : 'false'"
					@click="verdictFilter = verdictOpt.id">
					<span>{{ verdictOpt.label }}</span>
				</button>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty && analysis.clusters.length === 0"
			class="irw__empty-banner"
			role="note">
			<div class="irw__empty-text">
				<p class="irw__empty-title">
					{{ t('duplicatefinder', 'No OS installer, firmware, package cache, or ISO duplicate clusters match the active filters') }}
				</p>
				<p class="irw__empty-hint">
					{{ t('duplicatefinder', 'Adjust the family filter, lower minimum size, or clear the search query to inspect other duplicate groups.') }}
				</p>
			</div>
			<button
				type="button"
				class="irw__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset Filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="irw__workstation">
			<div class="irw__list-pane">
				<div class="irw__pane-header">
					<span class="irw__pane-title">
						{{ t('duplicatefinder', 'Distribution Clusters ({count})', { count: analysis.clusters.length }) }}
					</span>
				</div>

				<div class="irw__cluster-list">
					<button
						v-for="cluster in visibleClusters"
						:key="cluster.groupKey"
						type="button"
						class="irw__cluster-item"
						:class="{ 'is-selected': selectedCluster && selectedCluster.groupKey === cluster.groupKey }"
						@click="selectedClusterKey = cluster.groupKey">
						<div class="irw__cluster-top">
							<span class="irw__cluster-name">{{ cluster.displayName }}</span>
							<span
								class="irw__pill"
								:class="`is-risk-${cluster.clusterRiskState}`">
								{{ formatRiskLabel(cluster.clusterRiskState) }}
							</span>
						</div>
						<div class="irw__cluster-meta">
							<span>{{ cluster.familyLabel }}</span>
							<span>{{ cluster.archSummary }}</span>
							<span v-if="cluster.versionSummary !== 'unversioned'">v{{ cluster.versionSummary }}</span>
							<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
							<span>{{ cluster.formattedReclaimableBytes }}</span>
						</div>
						<div
							v-if="cluster.survivor"
							class="irw__cluster-path">
							{{ cluster.survivor.normalizedPath }}
						</div>
					</button>
				</div>

				<div
					v-if="analysis.clusters.length > visibleLimit"
					class="irw__load-more-wrap">
					<button
						type="button"
						class="irw__tool-btn"
						@click="visibleLimit += 25">
						<span>{{ t('duplicatefinder', 'Load more ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="selectedCluster"
				class="irw__inspector-pane">
				<header class="irw__inspector-header">
					<div class="irw__inspector-title-wrap">
						<h4 class="irw__inspector-title">
							{{ selectedCluster.displayName }}
						</h4>
						<span class="irw__inspector-sub">
							{{ selectedCluster.familyLabel }} / .{{ selectedCluster.extension }} / {{ selectedCluster.platformSummary }}
						</span>
					</div>

					<div class="irw__inspector-actions">
						<button
							type="button"
							class="irw__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Focus Group') }}</span>
						</button>
						<button
							type="button"
							class="irw__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Compare Copies') }}</span>
						</button>
					</div>
				</header>

				<div
					v-if="selectedCluster.hasGoldenRepoCopy || selectedCluster.hasFirmwareVaultCopy"
					class="irw__warn-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'Golden Repository & Firmware Protection Active:') }}</strong>
					{{ t('duplicatefinder', 'Copies inside PXE/MDT/software-repo or firmware-vault paths are shielded against accidental deletion unless you switch to Hardlink Repo Mirrors or disable the guard.') }}
				</div>

				<div
					v-if="selectedCluster.hasRcBetaCopy"
					class="irw__info-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'Pre-Release / RC Channel Detected:') }}</strong>
					{{ t('duplicatefinder', 'This cluster carries RC/beta/nightly release cues. Use Keep Golden / Purge Superseded RC & Downloads to prioritize stable/golden survivors.') }}
				</div>

				<div class="irw__meta-grid">
					<div class="irw__meta-item">
						<span class="irw__meta-label">{{ t('duplicatefinder', 'Architecture & Platform') }}</span>
						<span>{{ selectedCluster.archSummary }} / {{ selectedCluster.platformSummary }}</span>
					</div>
					<div class="irw__meta-item">
						<span class="irw__meta-label">{{ t('duplicatefinder', 'Version & Channel') }}</span>
						<span>{{ selectedCluster.versionSummary }} ({{ selectedCluster.channelSummary }})</span>
					</div>
					<div class="irw__meta-item">
						<span class="irw__meta-label">{{ t('duplicatefinder', 'Canonical Survivor') }}</span>
						<span class="irw__mono-text">{{ selectedCluster.survivor ? selectedCluster.survivor.normalizedPath : '-' }}</span>
					</div>
					<div class="irw__meta-item">
						<span class="irw__meta-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<span>{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableCopiesCount }} / {{ selectedCluster.copyCount }})</span>
					</div>
				</div>

				<div class="irw__member-list">
					<article
						v-for="member in selectedCluster.members"
						:key="member.selectionKey"
						class="irw__member-card"
						:class="`is-verdict-${member.verdict}`">
						<div class="irw__member-top">
							<span class="irw__member-name">{{ member.basename }}</span>
							<div class="irw__member-badges">
								<span
									class="irw__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdictLabel }}
								</span>
								<span
									class="irw__pill"
									:class="authorityPillClass(member.context.authorityScore)">
									{{ t('duplicatefinder', 'Authority {score}', { score: member.context.authorityScore }) }}
								</span>
							</div>
						</div>

						<div class="irw__member-path">
							{{ member.normalizedPath }}
						</div>

						<div class="irw__member-meta">
							<span>{{ member.tierLabel }}</span>
							<span>{{ member.formattedSize }}</span>
							<span v-if="member.context.ageDays !== null">{{ member.context.ageDays }}d {{ t('duplicatefinder', 'old') }}</span>
							<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
						</div>

						<div class="irw__companion-chips">
							<span class="irw__companion-chip">{{ member.context.arch }}</span>
							<span class="irw__companion-chip">{{ member.context.version }}</span>
							<span
								v-if="member.context.isGoldenProtected"
								class="irw__companion-chip is-warn">
								{{ t('duplicatefinder', 'Golden Repo') }}
							</span>
							<span
								v-if="member.context.isSignedOrVerified"
								class="irw__companion-chip is-warn">
								{{ t('duplicatefinder', 'Signed / Verified') }}
							</span>
							<span
								v-if="member.context.isFirmwareVault"
								class="irw__companion-chip is-warn">
								{{ t('duplicatefinder', 'Firmware Vault') }}
							</span>
							<span
								v-if="member.context.isUserDownload"
								class="irw__companion-chip">
								{{ t('duplicatefinder', 'User Download') }}
							</span>
						</div>

						<p class="irw__member-note">
							{{ member.note }}
						</p>

						<div class="irw__override-bar">
							<span class="irw__control-label">{{ t('duplicatefinder', 'Operator Override:') }}</span>
							<button
								type="button"
								class="irw__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'auto' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'auto' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'auto')">
								<span>{{ t('duplicatefinder', 'Auto') }}</span>
							</button>
							<button
								type="button"
								class="irw__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'shield' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'shield' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'shield')">
								<span>{{ t('duplicatefinder', 'Shield Copy') }}</span>
							</button>
							<button
								type="button"
								class="irw__seg-btn"
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
			class="irw__script-box">
			<summary class="irw__script-summary">
				{{ t('duplicatefinder', 'POSIX DRY_RUN=1 Script (SHA-256 Verified + Hardlinks + occ files:scan) & .sync-exclude.lst') }}
			</summary>
			<div class="irw__script-content">
				<div class="irw__script-actions">
					<button
						type="button"
						class="irw__tool-btn"
						@click="copyRemediationScript">
						<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
					</button>
					<button
						type="button"
						class="irw__tool-btn"
						@click="copySyncExcludeSnippet">
						<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
					</button>
				</div>
				<pre class="irw__code-pre"><code>{{ generatedScript }}</code></pre>
				<pre class="irw__code-pre"><code>{{ generatedSyncExclude }}</code></pre>
			</div>
		</details>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	INSTALLER_FAMILY_META,
	INSTALLER_PRESETS,
	analyzeInstallerRepoDuplicates,
	buildInstallerRepoCsvReport,
	buildInstallerRepoJsonReport,
	buildInstallerRepoScript,
	buildInstallerSyncExcludeSnippet,
} from '../tools/installerRepoAuditor'

export default {
	name: 'InstallerRepoWorkbench',
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
			presetId: 'all-installer-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'consolidate-repo',
			survivorRule: 'golden-repo-first',
			protectGoldenRepos: true,
			protectSignedArtifacts: true,
			protectFirmwareBlobs: true,
			staleDownloadDaysInput: '30',
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
			return INSTALLER_PRESETS
		},
		familyOptions() {
			return Object.values(INSTALLER_FAMILY_META)
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable / Hardlinkable') },
				{ id: 'golden-guarded', label: this.t('duplicatefinder', 'Golden Repo Guard') },
				{ id: 'firmware-guarded', label: this.t('duplicatefinder', 'Firmware Vault Guard') },
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
		parsedStaleDownloadDays() {
			const trimmed = String(this.staleDownloadDaysInput ?? '').trim()
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
		forceKeepKeys() {
			return Object.keys(this.memberOverrides).filter(k => this.memberOverrides[k] === 'shield')
		},
		excludeKeys() {
			return Object.keys(this.memberOverrides).filter(k => this.memberOverrides[k] === 'exclude')
		},
		analysis() {
			return analyzeInstallerRepoDuplicates(this.activePool, {
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectGoldenRepos: this.protectGoldenRepos,
				protectSignedArtifacts: this.protectSignedArtifacts,
				protectFirmwareBlobs: this.protectFirmwareBlobs,
				staleDownloadDays: this.parsedStaleDownloadDays,
				minSizeMb: this.parsedMinSizeMb,
				searchQuery: this.searchQueryInput,
				forceKeepKeys: this.forceKeepKeys,
				excludeKeys: this.excludeKeys,
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
			return buildInstallerRepoScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
		generatedSyncExclude() {
			return buildInstallerSyncExcludeSnippet(this.analysis)
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
			const preset = INSTALLER_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectGoldenRepos = preset.protectGoldenRepos
			this.protectSignedArtifacts = preset.protectSignedArtifacts
			this.protectFirmwareBlobs = preset.protectFirmwareBlobs
			this.staleDownloadDaysInput = String(preset.staleDownloadDays)
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
				'golden-guarded': this.t('duplicatefinder', 'Golden Repo Guarded'),
				'firmware-guarded': this.t('duplicatefinder', 'Firmware Guarded'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		verdictPillClass(verdict) {
			if (verdict === 'keep-golden-survivor') {
				return 'is-keep'
			}
			if (verdict === 'blocked-golden-repo' || verdict === 'blocked-firmware-vault') {
				return 'is-danger'
			}
			if (verdict === 'blocked-signed-artifact' || verdict === 'blocked-manual-shield' || verdict === 'excluded') {
				return 'is-warn'
			}
			if (verdict === 'hardlink-repo-mirror') {
				return 'is-hardlink'
			}
			return 'is-reclaim'
		},
		authorityPillClass(score) {
			if (score >= 85) {
				return 'is-keep'
			}
			if (score >= 45) {
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
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 installer and ISO repository script to clipboard.'))
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
			const csv = buildInstallerRepoCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-installer-repo-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe installer repository CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildInstallerRepoJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-installer-repo-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported installer repository JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.installer-repo-workbench {
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

.irw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.irw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.irw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.irw__status-badge {
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

.irw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.irw__tool-btn,
.irw__seg-btn,
.irw__chip,
.irw__primary-btn {
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

.irw__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, #ffffff);
}

.irw__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.irw__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element, #0082c9);
}

.irw__seg-btn.is-active,
.irw__chip.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.irw__tool-btn:focus-visible,
.irw__seg-btn:focus-visible,
.irw__chip:focus-visible,
.irw__primary-btn:focus-visible,
.irw__cluster-item:focus-visible,
.irw__input:focus-visible,
.irw__script-summary:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.irw__notice {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	font-size: 0.86rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.irw__notice.is-success {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.irw__notice.is-error {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.irw__empty-banner {
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

.irw__empty-text {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 68ch;
}

.irw__empty-title {
	margin: 0;
	font-weight: 700;
	font-size: 0.94rem;
}

.irw__empty-hint {
	margin: 0;
	font-size: 0.85rem;
	color: var(--color-text-maxcontrast);
	line-height: 1.45;
}

.irw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
}

.irw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.irw__control-label {
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.irw__segments,
.irw__chip-group,
.irw__filters-strip {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.irw__filters-strip {
	flex-direction: column;
	gap: 8px;
}

.irw__inputs-row {
	align-items: flex-end;
}

.irw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.irw__field-grow {
	flex: 1 1 200px;
}

.irw__field-label {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.irw__input {
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

.irw__num-input {
	inline-size: 108px;
	max-inline-size: 100%;
}

.irw__kpis {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 10px;
}

@media (min-width: 560px) {
	.irw__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (min-width: 980px) {
	.irw__kpis {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
}

.irw__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.irw__kpi-label {
	font-size: 0.76rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.irw__kpi-val {
	font-size: 1.02rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.irw__kpi-val.is-accent {
	color: #0b4a8b;
}

.irw__kpi-val.is-warn {
	color: #7c4a03;
}

.irw__workstation {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 14px;
}

@media (min-width: 1080px) {
	.irw__workstation {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
		align-items: start;
	}
}

.irw__list-pane,
.irw__inspector-pane {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.irw__pane-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.irw__pane-title {
	font-size: 0.88rem;
	font-weight: 700;
}

.irw__cluster-list,
.irw__member-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.irw__cluster-item {
	display: flex;
	flex-direction: column;
	align-items: stretch;
	gap: 4px;
	padding: 10px 12px;
	min-block-size: 44px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	text-align: start;
	cursor: pointer;
	min-inline-size: 0;
}

.irw__cluster-item.is-selected {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light);
}

.irw__cluster-top,
.irw__member-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.irw__cluster-name,
.irw__member-name {
	font-weight: 700;
	font-size: 0.9rem;
	overflow-wrap: anywhere;
}

.irw__cluster-path,
.irw__member-path {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.irw__cluster-meta,
.irw__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.irw__pill {
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.72rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.irw__pill.is-risk-firmware-guarded,
.irw__pill.is-danger {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.irw__pill.is-risk-golden-guarded,
.irw__pill.is-risk-shielded,
.irw__pill.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.irw__pill.is-hardlink {
	background-color: #e8f1fb;
	color: #0b4a8b;
	border-color: #9ec5fe;
}

.irw__pill.is-risk-reclaimable,
.irw__pill.is-reclaim,
.irw__pill.is-keep {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.irw__inspector-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.irw__inspector-title-wrap {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
}

.irw__inspector-title {
	margin: 0;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.irw__inspector-sub {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.irw__inspector-actions,
.irw__override-bar,
.irw__member-badges,
.irw__companion-chips {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.irw__companion-chip {
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

.irw__companion-chip.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.irw__warn-banner {
	padding: 10px 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #f5c97b;
	background-color: #fff4e5;
	color: #7c4a03;
	font-size: 0.83rem;
	line-height: 1.45;
}

.irw__info-banner {
	padding: 10px 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #9ec5fe;
	background-color: #e8f1fb;
	color: #0b4a8b;
	font-size: 0.83rem;
	line-height: 1.45;
}

.irw__meta-grid {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 8px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
}

@media (min-width: 640px) {
	.irw__meta-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

.irw__meta-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.84rem;
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.irw__meta-label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.irw__mono-text {
	font-family: monospace;
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}

.irw__member-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.irw__member-card.is-verdict-keep-golden-survivor,
.irw__member-card.is-verdict-reclaim-duplicate-copy,
.irw__member-card.is-verdict-reclaim-superseded-rc {
	border-inline-start: 4px solid #0f5132;
}

.irw__member-card.is-verdict-hardlink-repo-mirror {
	border-inline-start: 4px solid #0b4a8b;
}

.irw__member-card.is-verdict-blocked-golden-repo,
.irw__member-card.is-verdict-blocked-firmware-vault {
	border-inline-start: 4px solid #842029;
}

.irw__member-card.is-verdict-blocked-signed-artifact,
.irw__member-card.is-verdict-blocked-manual-shield,
.irw__member-card.is-verdict-excluded {
	border-inline-start: 4px solid #7c4a03;
}

.irw__member-note {
	margin: 0;
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 68ch;
}

.irw__script-box {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	padding: 8px 12px;
	background-color: var(--color-main-background);
}

.irw__script-summary {
	display: flex;
	align-items: center;
	min-block-size: 44px;
	font-weight: 700;
	font-size: 0.86rem;
	cursor: pointer;
}

.irw__script-content {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block-start: 8px;
}

.irw__script-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.irw__code-pre {
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

.irw__load-more-wrap {
	display: flex;
	justify-content: center;
	padding-block: 6px;
}
</style>
