<template>
	<section
		class="broadcast-nle-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Broadcast Video, NLE Proxy and Camera Card Media Vault Auditor')">
		<header class="bnlv__toolbar">
			<div class="bnlv__title-group">
				<h3 class="bnlv__title">
					{{ t('duplicatefinder', 'Broadcast Video, NLE Proxy & Camera Card Media Vault Auditor') }}
				</h3>
				<span
					class="bnlv__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {ocf} OCF rushes, {projects} timelines, {masters} masters, {offloads} dup offloads', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						ocf: analysis.summary.totalCameraOriginalClusters,
						projects: analysis.summary.totalProjectTimelineClusters,
						masters: analysis.summary.totalMasterExportClusters,
						offloads: analysis.summary.totalDuplicateOffloadClusters,
					}) }}
				</span>
			</div>

			<div class="bnlv__toolbar-actions">
				<button
					type="button"
					class="bnlv__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="bnlv__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="bnlv__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="bnlv__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="bnlv__tool-btn is-close"
					aria-keyshortcuts="Shift+F9"
					:title="t('duplicatefinder', 'Hide Broadcast Video, NLE Proxy and Camera Card Media Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Broadcast & NLE Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="bnlv__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="bnlv__kpis">
			<div class="bnlv__kpi">
				<span class="bnlv__kpi-label">{{ t('duplicatefinder', 'Safe Proxy & Offload Reclaim') }}</span>
				<strong class="bnlv__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="bnlv__kpi">
				<span class="bnlv__kpi-label">{{ t('duplicatefinder', 'OCF Rushes & NLE Timelines') }}</span>
				<strong class="bnlv__kpi-val is-warn">
					{{ analysis.summary.totalCameraOriginalClusters }} {{ t('duplicatefinder', 'OCF') }} / {{ analysis.summary.totalProjectTimelineClusters }} {{ t('duplicatefinder', 'projects') }} / {{ analysis.summary.totalMasterExportClusters }} {{ t('duplicatefinder', 'masters') }}
				</strong>
			</div>
			<div class="bnlv__kpi">
				<span class="bnlv__kpi-label">{{ t('duplicatefinder', 'Card Offloads & NLE Caches') }}</span>
				<strong class="bnlv__kpi-val">
					{{ analysis.summary.totalDuplicateOffloadClusters }} {{ t('duplicatefinder', 'card offloads') }} / {{ analysis.summary.totalRegenerableProxyClusters }} {{ t('duplicatefinder', 'proxies/caches') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="bnlv__kpi">
				<span class="bnlv__kpi-label">{{ t('duplicatefinder', 'Raw Media Footprint') }}</span>
				<strong class="bnlv__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="bnlv__empty-banner"
			role="note">
			<div class="bnlv__empty-text">
				<p class="bnlv__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure OCF camera rush, timeline, and master shields before scanning') }}
				</p>
				<p class="bnlv__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit camera rushes (.r3d, .braw, .mxf, ProRes .mov, XAVC/AVCHD .mp4/.mts), repeated SD/CFexpress card offloads, regenerable NLE proxies/caches (Proxy/, Optimized Media/, CacheClip/, Video Previews, .pek, .cfa), timelines (.drp, .prproj, .fcpxml, .aep, .xml), and broadcast masters.') }}
				</p>
			</div>
			<button
				type="button"
				class="bnlv__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="bnlv__controls">
			<div class="bnlv__control-row">
				<span class="bnlv__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="bnlv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Broadcast and NLE vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="bnlv__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="bnlv__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="bnlv__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="bnlv__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="bnlv__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="bnlv__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="bnlv__seg-btn"
					:class="{ 'is-active': protectCameraOriginals }"
					:aria-pressed="protectCameraOriginals ? 'true' : 'false'"
					@click="protectCameraOriginals = !protectCameraOriginals">
					<span>{{ protectCameraOriginals ? t('duplicatefinder', 'Shield Camera Rushes (OCF): ON') : t('duplicatefinder', 'Shield Camera Rushes (OCF): OFF') }}</span>
				</button>

				<button
					type="button"
					class="bnlv__seg-btn"
					:class="{ 'is-active': protectProjectsTimelines }"
					:aria-pressed="protectProjectsTimelines ? 'true' : 'false'"
					@click="protectProjectsTimelines = !protectProjectsTimelines">
					<span>{{ protectProjectsTimelines ? t('duplicatefinder', 'Shield Projects/Timelines: ON') : t('duplicatefinder', 'Shield Projects/Timelines: OFF') }}</span>
				</button>

				<button
					type="button"
					class="bnlv__seg-btn"
					:class="{ 'is-active': protectMasterExports }"
					:aria-pressed="protectMasterExports ? 'true' : 'false'"
					@click="protectMasterExports = !protectMasterExports">
					<span>{{ protectMasterExports ? t('duplicatefinder', 'Shield Master Exports: ON') : t('duplicatefinder', 'Shield Master Exports: OFF') }}</span>
				</button>

				<button
					type="button"
					class="bnlv__seg-btn"
					:class="{ 'is-active': requireVerifiedOcfForOffloadPrune }"
					:aria-pressed="requireVerifiedOcfForOffloadPrune ? 'true' : 'false'"
					@click="requireVerifiedOcfForOffloadPrune = !requireVerifiedOcfForOffloadPrune">
					<span>{{ requireVerifiedOcfForOffloadPrune ? t('duplicatefinder', 'Require OCF Anchor for Offloads: ON') : t('duplicatefinder', 'Require OCF Anchor for Offloads: OFF') }}</span>
				</button>
			</div>

			<div class="bnlv__control-row bnlv__inputs-row">
				<label class="bnlv__field">
					<span class="bnlv__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="bnlv__input">
						<option value="prune-proxies-and-duplicate-offloads">{{ t('duplicatefinder', 'Prune Proxies & Dup Offloads (Keep OCF & Projects)') }}</option>
						<option value="hardlink-camera-rushes-vault">{{ t('duplicatefinder', 'Hardlink Camera Rushes & Masters (Block Projects)') }}</option>
						<option value="quarantine-proxies-and-offloads">{{ t('duplicatefinder', 'Quarantine Proxies & Dup Offloads Only') }}</option>
					</select>
				</label>

				<label class="bnlv__field">
					<span class="bnlv__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="bnlv__input">
						<option value="camera-vault-and-master-first">{{ t('duplicatefinder', 'OCF Vault, Projects & Masters first') }}</option>
						<option value="oldest-ingest-first">{{ t('duplicatefinder', 'Oldest camera ingest mtime first') }}</option>
						<option value="newest-edit-first">{{ t('duplicatefinder', 'Newest timeline/export mtime first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="bnlv__field">
					<span class="bnlv__field-label">{{ t('duplicatefinder', 'Recent Cache Grace (d)') }}</span>
					<input
						v-model="keepRecentCacheDaysInput"
						type="number"
						min="0"
						step="1"
						class="bnlv__input bnlv__num-input">
				</label>

				<label class="bnlv__field">
					<span class="bnlv__field-label">{{ t('duplicatefinder', 'Min Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="bnlv__input bnlv__num-input">
				</label>

				<label class="bnlv__field bnlv__field-grow">
					<span class="bnlv__field-label">{{ t('duplicatefinder', 'Filter Clip, Card, Codec or NLE Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="bnlv__input"
						:placeholder="t('duplicatefinder', 'e.g. .r3d, .braw, CFexpress, CacheClip, .drp, .prproj, ProRes')">
				</label>

				<label class="bnlv__field">
					<span class="bnlv__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="bnlv__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Protection priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Clip filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="bnlv__control-row">
				<span class="bnlv__control-label">{{ t('duplicatefinder', 'Media Family') }}</span>
				<div
					class="bnlv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Broadcast and NLE media family filter')">
					<button
						type="button"
						class="bnlv__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="bnlv__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="bnlv__control-row">
				<span class="bnlv__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="bnlv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Broadcast and NLE governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="bnlv__seg-btn"
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
			class="bnlv__empty-filter"
			role="note">
			<p class="bnlv__empty-title">
				{{ t('duplicatefinder', 'No camera rushes, NLE proxies, timelines, or master exports match the active filters.') }}
			</p>
			<button
				type="button"
				class="bnlv__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="bnlv__workspace">
			<div
				class="bnlv__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Broadcast Video, NLE Proxy and Camera Card clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="bnlv__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="bnlv__cluster-top">
						<strong class="bnlv__cluster-name">{{ cluster.name }}</strong>
						<span
							class="bnlv__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="bnlv__cluster-meta">
						<span class="bnlv__tag">{{ cluster.clipStem || cluster.name }}</span>
						<span class="bnlv__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="bnlv__cluster-badges">
						<span
							v-if="cluster.hasCameraOriginal"
							class="bnlv__badge is-danger">
							{{ t('duplicatefinder', 'Camera Original (OCF)') }}
						</span>
						<span
							v-if="cluster.hasProjectTimeline"
							class="bnlv__badge is-keep">
							{{ t('duplicatefinder', 'NLE Project / Timeline') }}
						</span>
						<span
							v-if="cluster.hasMasterExport"
							class="bnlv__badge is-keep">
							{{ t('duplicatefinder', 'Master Export') }}
						</span>
						<span
							v-if="cluster.hasDuplicateCardOffload"
							class="bnlv__badge is-warn">
							{{ t('duplicatefinder', 'Multi-Offload Card') }}
						</span>
						<span
							v-if="cluster.hasRegenerableProxy"
							class="bnlv__badge is-consolidate">
							{{ t('duplicatefinder', 'Regenerable Proxy/Cache') }}
						</span>
					</div>
					<div class="bnlv__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="bnlv__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="bnlv__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="bnlv__inspector">
				<header class="bnlv__inspector-head">
					<div class="bnlv__inspector-title-wrap">
						<h4 class="bnlv__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="bnlv__inspector-sub">
							{{ selectedCluster.clipStem || selectedCluster.name }} | {{ selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="bnlv__inspector-actions">
						<button
							type="button"
							class="bnlv__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="bnlv__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="bnlv__lineage-grid">
					<div class="bnlv__lineage-item">
						<span class="bnlv__lineage-label">{{ t('duplicatefinder', 'Clip / Reel Lineage Stem') }}</span>
						<strong class="bnlv__lineage-val">{{ selectedCluster.clipStem || selectedCluster.name }} ({{ selectedCluster.familyLabel }})</strong>
					</div>
					<div class="bnlv__lineage-item">
						<span class="bnlv__lineage-label">{{ t('duplicatefinder', 'Vault Conservation Status') }}</span>
						<strong class="bnlv__lineage-val">
							{{ selectedCluster.hasProjectTimeline ? t('duplicatefinder', 'NLE Project/Timeline Shielded') : (selectedCluster.hasMasterExport ? t('duplicatefinder', 'Master Export Shielded') : (selectedCluster.hasCameraOriginal ? t('duplicatefinder', 'OCF Camera Original Shielded') : t('duplicatefinder', 'Regenerable Proxy / Cache'))) }}
						</strong>
					</div>
					<div class="bnlv__lineage-item">
						<span class="bnlv__lineage-label">{{ t('duplicatefinder', 'Camera Card Signatures') }}</span>
						<strong class="bnlv__lineage-val">
							{{ selectedCluster.cardSignatures.length > 0 ? selectedCluster.cardSignatures.join(', ') : t('duplicatefinder', 'Standard NLE / Vault path') }}
						</strong>
					</div>
					<div class="bnlv__lineage-item">
						<span class="bnlv__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="bnlv__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="bnlv__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="bnlv__member-card">
						<div class="bnlv__member-top">
							<code class="bnlv__member-path">{{ member.normalized }}</code>
							<div class="bnlv__member-pills">
								<span
									class="bnlv__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.cardSignature"
									class="bnlv__pill is-warn">
									{{ member.cardSignature }}
								</span>
								<span
									class="bnlv__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="bnlv__member-bottom">
							<div class="bnlv__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.offloadRole }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="bnlv__member-actions">
								<button
									type="button"
									class="bnlv__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="!member.isSurvivor && !(member.isProjectOrTimeline && !member.isAutosavePath && protectProjectsTimelines) && !(member.isMasterExport && member.isMasterPath && protectMasterExports)"
									class="bnlv__override-field">
									<span class="bnlv__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="bnlv__override-select"
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

				<div class="bnlv__code-panels">
					<div class="bnlv__code-box">
						<div class="bnlv__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="bnlv__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="bnlv__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="bnlv__code-box">
						<div class="bnlv__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="bnlv__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="bnlv__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	BROADCAST_NLE_PRESETS,
	auditBroadcastNleVault,
	buildBroadcastNleCsvReport,
	buildBroadcastNleJsonManifest,
	buildBroadcastNleRemediationScript,
	buildBroadcastNleSyncExcludeList,
} from '../tools/broadcastNleVaultAuditor'

export default {
	name: 'BroadcastNleVaultWorkbench',
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
			presetId: 'all-broadcast-nle-vault-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-proxies-and-duplicate-offloads',
			survivorRule: 'camera-vault-and-master-first',
			protectCameraOriginals: true,
			protectProjectsTimelines: true,
			protectMasterExports: true,
			requireVerifiedOcfForOffloadPrune: true,
			keepRecentCacheDaysInput: '0',
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
			return BROADCAST_NLE_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'camera-original-protected', label: this.t('duplicatefinder', 'Camera Original (OCF)') },
				{ id: 'nle-project-timeline-protected', label: this.t('duplicatefinder', 'Project / Timeline') },
				{ id: 'broadcast-master-protected', label: this.t('duplicatefinder', 'Master Export') },
				{ id: 'card-offload-duplicate', label: this.t('duplicatefinder', 'Dup Card Offload') },
				{ id: 'regenerable-proxy-cache', label: this.t('duplicatefinder', 'Proxy / Cache') },
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
		parsedKeepRecentCacheDays() {
			const trimmed = String(this.keepRecentCacheDaysInput ?? '').trim()
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
			return auditBroadcastNleVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectCameraOriginals: this.protectCameraOriginals,
				protectProjectsTimelines: this.protectProjectsTimelines,
				protectMasterExports: this.protectMasterExports,
				requireVerifiedOcfForOffloadPrune: this.requireVerifiedOcfForOffloadPrune,
				keepRecentCacheDays: this.parsedKeepRecentCacheDays,
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
			return buildBroadcastNleRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildBroadcastNleSyncExcludeList()
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
			const preset = BROADCAST_NLE_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectCameraOriginals = preset.protectCameraOriginals
			this.protectProjectsTimelines = preset.protectProjectsTimelines
			this.protectMasterExports = preset.protectMasterExports
			this.requireVerifiedOcfForOffloadPrune = preset.requireVerifiedOcfForOffloadPrune
			this.keepRecentCacheDaysInput = String(preset.keepRecentCacheDays)
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
				'camera-original-protected': this.t('duplicatefinder', 'Camera Original'),
				'nle-project-timeline-protected': this.t('duplicatefinder', 'Project / Timeline'),
				'broadcast-master-protected': this.t('duplicatefinder', 'Master Export'),
				'card-offload-duplicate': this.t('duplicatefinder', 'Dup Card Offload'),
				'regenerable-proxy-cache': this.t('duplicatefinder', 'Proxy / Cache'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'camera-original-protected') {
				return 'is-danger'
			}
			if (verdict === 'nle-project-timeline-protected' || verdict === 'broadcast-master-protected') {
				return 'is-keep'
			}
			if (verdict === 'regenerable-proxy-cache') {
				return 'is-consolidate'
			}
			if (verdict === 'card-offload-duplicate') {
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
				return this.strategy === 'quarantine-proxies-and-offloads'
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
				this.setNotice(this.t('duplicatefinder', 'Copied media path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Broadcast & NLE remediation script to clipboard.'))
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
			const csv = buildBroadcastNleCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-broadcast-nle-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Broadcast & NLE Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildBroadcastNleJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-broadcast-nle-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Broadcast & NLE Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.broadcast-nle-vault-workbench {
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

.bnlv__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.bnlv__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.bnlv__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.bnlv__status-badge {
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

.bnlv__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.bnlv__tool-btn,
.bnlv__seg-btn,
.bnlv__primary-btn,
.bnlv__load-more-btn,
.bnlv__mini-btn {
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

.bnlv__tool-btn:hover:not(:disabled),
.bnlv__seg-btn:hover:not(:disabled),
.bnlv__load-more-btn:hover:not(:disabled),
.bnlv__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.bnlv__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.bnlv__tool-btn.is-primary-outline,
.bnlv__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.bnlv__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.bnlv__tool-btn:focus-visible,
.bnlv__seg-btn:focus-visible,
.bnlv__primary-btn:focus-visible,
.bnlv__load-more-btn:focus-visible,
.bnlv__mini-btn:focus-visible,
.bnlv__cluster-card:focus-visible,
.bnlv__input:focus-visible,
.bnlv__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.bnlv__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.bnlv__notice.is-success {
	background-color: var(--color-background-hover);
	border-color: var(--color-success, #2d8a4e);
}

.bnlv__notice.is-error {
	background-color: var(--color-background-hover);
	border-color: var(--color-error, #b91c1c);
}

.bnlv__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.bnlv__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.bnlv__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.bnlv__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.bnlv__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.bnlv__kpi-val.is-warn {
	color: var(--color-warning-text, var(--color-main-text));
}

.bnlv__empty-banner,
.bnlv__empty-filter {
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

.bnlv__empty-text {
	flex: 1 1 240px;
	min-inline-size: 0;
}

.bnlv__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.bnlv__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.bnlv__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.bnlv__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.bnlv__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 96px;
}

.bnlv__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.bnlv__inputs-row {
	align-items: flex-end;
}

.bnlv__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.bnlv__field-grow {
	flex: 1 1 180px;
}

.bnlv__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.bnlv__input,
.bnlv__override-select {
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

.bnlv__num-input {
	inline-size: 96px;
}

.bnlv__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.bnlv__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.bnlv__cluster-card {
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

.bnlv__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.bnlv__cluster-top,
.bnlv__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.bnlv__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.bnlv__cluster-meta,
.bnlv__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.bnlv__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.bnlv__badge,
.bnlv__pill {
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

.bnlv__pill.is-keep,
.bnlv__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.bnlv__pill.is-danger,
.bnlv__badge.is-danger {
	border-color: var(--color-error, #b91c1c);
}

.bnlv__pill.is-consolidate,
.bnlv__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.bnlv__pill.is-warn,
.bnlv__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.bnlv__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.bnlv__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.bnlv__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.bnlv__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.bnlv__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.bnlv__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.bnlv__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.bnlv__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.bnlv__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.bnlv__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.bnlv__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.bnlv__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.bnlv__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.bnlv__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.bnlv__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.bnlv__member-top,
.bnlv__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.bnlv__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.bnlv__member-pills,
.bnlv__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.bnlv__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.bnlv__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.bnlv__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.bnlv__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.bnlv__pre {
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

.bnlv__sr-only {
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
	.bnlv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.bnlv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.bnlv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.broadcast-nle-vault-workbench {
		padding: 10px;
	}

	.bnlv__kpis,
	.bnlv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.bnlv__num-input {
		inline-size: 100%;
	}

	.bnlv__field {
		flex: 1 1 100%;
	}
}
</style>
