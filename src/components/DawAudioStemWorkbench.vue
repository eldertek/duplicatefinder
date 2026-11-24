<template>
	<section
		class="daw-audio-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'DAW Session, Lossless Stem Master, Mixdown Revision and Peak Cache Auditor')">
		<header class="dasw__toolbar">
			<div class="dasw__title-group">
				<h3 class="dasw__title">
					{{ t('duplicatefinder', 'DAW Session, Lossless Stem Master, Mixdown & Peak Cache Auditor') }}
				</h3>
				<span
					class="dasw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} reclaimable / {vault} master-vaulted', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						vault: analysis.summary.totalMasterVaultClusters,
					}) }}
				</span>
			</div>

			<div class="dasw__toolbar-actions">
				<button
					type="button"
					class="dasw__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="dasw__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="dasw__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="dasw__tool-btn is-close"
					aria-keyshortcuts="&quot;"
					:title="t('duplicatefinder', 'Hide DAW Session, Lossless Stem Master, Mixdown Revision and Peak Cache Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Audio & DAW') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="dasw__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="dasw__empty-banner"
			role="note">
			<div class="dasw__empty-text">
				<p class="dasw__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure Master Vault and Active DAW Session guards before scanning') }}
				</p>
				<p class="dasw__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit DAW session roots (.als/.flp/.logicx/.ptx/.cpr/.rpp/.sesx), lossless studio masters and stems (.wav/.aiff/.flac/.bwf/.caf/.rf64), lossy review exports (_rough/_mix_v2/_premaster), and peak/freeze caches (.asd/.pkf/.reapeaks/.ovw).') }}
				</p>
			</div>
			<button
				type="button"
				class="dasw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="dasw__controls">
			<div class="dasw__control-row">
				<span class="dasw__control-label">{{ t('duplicatefinder', 'Audit Preset') }}</span>
				<div
					class="dasw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Audio and DAW audit presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="dasw__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="dasw__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="dasw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="dasw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="dasw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="dasw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="dasw__seg-btn"
					:class="{ 'is-active': protectReleasedMasterVault }"
					:aria-pressed="protectReleasedMasterVault ? 'true' : 'false'"
					@click="protectReleasedMasterVault = !protectReleasedMasterVault">
					<span>{{ protectReleasedMasterVault ? t('duplicatefinder', 'Master / ISRC Vault Guard: ON') : t('duplicatefinder', 'Master / ISRC Vault Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="dasw__seg-btn"
					:class="{ 'is-active': protectActiveDawSession }"
					:aria-pressed="protectActiveDawSession ? 'true' : 'false'"
					@click="protectActiveDawSession = !protectActiveDawSession">
					<span>{{ protectActiveDawSession ? t('duplicatefinder', 'Active DAW Session Guard: ON') : t('duplicatefinder', 'Active DAW Session Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="dasw__seg-btn"
					:class="{ 'is-active': protectVerifiedLosslessMaster }"
					:aria-pressed="protectVerifiedLosslessMaster ? 'true' : 'false'"
					@click="protectVerifiedLosslessMaster = !protectVerifiedLosslessMaster">
					<span>{{ protectVerifiedLosslessMaster ? t('duplicatefinder', 'Lossless Master Guard: ON') : t('duplicatefinder', 'Lossless Master Guard: OFF') }}</span>
				</button>
			</div>

			<div class="dasw__control-row dasw__inputs-row">
				<label class="dasw__field">
					<span class="dasw__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="dasw__input">
						<option value="consolidate-studio-masters">{{ t('duplicatefinder', 'Consolidate to Studio Master Vault') }}</option>
						<option value="prune-stale-peak-freeze-caches">{{ t('duplicatefinder', 'Prune Stale Peak & Freeze Caches') }}</option>
						<option value="prune-lossy-twins-when-lossless-verified">{{ t('duplicatefinder', 'Prune Lossy Twins When Lossless Verified') }}</option>
					</select>
				</label>

				<label class="dasw__field">
					<span class="dasw__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="dasw__input">
						<option value="master-vault-and-daw-first">{{ t('duplicatefinder', 'Master Vault & Active DAW first') }}</option>
						<option value="lossless-master-first">{{ t('duplicatefinder', 'Verified lossless master first') }}</option>
						<option value="newest-session-first">{{ t('duplicatefinder', 'Newest session timestamp first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="dasw__field">
					<span class="dasw__field-label">{{ t('duplicatefinder', 'Keep Mix Revisions') }}</span>
					<input
						v-model="keepRecentRevisionsInput"
						type="number"
						min="1"
						step="1"
						class="dasw__input dasw__num-input">
				</label>

				<label class="dasw__field">
					<span class="dasw__field-label">{{ t('duplicatefinder', 'Stale Cache (d)') }}</span>
					<input
						v-model="staleCacheDaysInput"
						type="number"
						min="0"
						step="1"
						class="dasw__input dasw__num-input">
				</label>

				<label class="dasw__field">
					<span class="dasw__field-label">{{ t('duplicatefinder', 'Min Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="dasw__input dasw__num-input">
				</label>

				<label class="dasw__field dasw__field-grow">
					<span class="dasw__field-label">{{ t('duplicatefinder', 'Filter Lineage Stem, Tag or Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="dasw__input"
						:placeholder="t('duplicatefinder', 'e.g. _MASTER, 24bit, .als, .reapeaks, ISRC')">
				</label>

				<label class="dasw__field dasw__field-grow">
					<span class="dasw__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="dasw__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="dasw__field">
					<span class="dasw__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="dasw__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Master & session risk') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact name (A-Z)') }}</option>
					</select>
				</label>
			</div>
		</div>

		<div class="dasw__kpis">
			<div class="dasw__kpi">
				<span class="dasw__kpi-label">{{ t('duplicatefinder', 'Safe Studio Reclaim') }}</span>
				<strong class="dasw__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="dasw__kpi">
				<span class="dasw__kpi-label">{{ t('duplicatefinder', 'Master Vault & Active DAW') }}</span>
				<strong class="dasw__kpi-val is-warn">
					{{ analysis.summary.totalMasterVaultClusters }} {{ t('duplicatefinder', 'master vault') }} / {{ analysis.summary.totalActiveDawClusters }} {{ t('duplicatefinder', 'DAW active') }}
				</strong>
			</div>
			<div class="dasw__kpi">
				<span class="dasw__kpi-label">{{ t('duplicatefinder', 'Lossy Twins & Peak Caches') }}</span>
				<strong class="dasw__kpi-val">
					{{ analysis.summary.totalLossyTwinClusters }} {{ t('duplicatefinder', 'lossy twins') }} / {{ analysis.summary.totalPeakCacheClusters }} {{ t('duplicatefinder', 'peak caches') }}
				</strong>
			</div>
			<div class="dasw__kpi">
				<span class="dasw__kpi-label">{{ t('duplicatefinder', 'Raw Studio Footprint') }}</span>
				<strong class="dasw__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty"
			class="dasw__filters-strip">
			<div
				class="dasw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by audio and DAW family')">
				<button
					type="button"
					class="dasw__chip"
					:class="{ 'is-active': familyFilter === 'all' }"
					:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
					@click="familyFilter = 'all'">
					<span>{{ t('duplicatefinder', 'All Audio & DAW ({count})', { count: analysis.summary.familyCounts.all || 0 }) }}</span>
				</button>
				<button
					v-for="familyItem in familyOptions"
					:key="familyItem.id"
					type="button"
					class="dasw__chip"
					:class="{ 'is-active': familyFilter === familyItem.id }"
					:aria-pressed="familyFilter === familyItem.id ? 'true' : 'false'"
					@click="familyFilter = familyItem.id">
					<span>{{ familyItem.label }} ({{ analysis.summary.familyCounts[familyItem.id] || 0 }})</span>
				</button>
			</div>

			<div
				class="dasw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by audio audit verdict')">
				<button
					v-for="verdictOpt in verdictFilterOptions"
					:key="verdictOpt.id"
					type="button"
					class="dasw__chip"
					:class="{ 'is-active': verdictFilter === verdictOpt.id }"
					:aria-pressed="verdictFilter === verdictOpt.id ? 'true' : 'false'"
					@click="verdictFilter = verdictOpt.id">
					<span>{{ verdictOpt.label }}</span>
				</button>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty && analysis.clusters.length === 0"
			class="dasw__empty-banner"
			role="note">
			<div class="dasw__empty-text">
				<p class="dasw__empty-title">
					{{ t('duplicatefinder', 'No DAW session, lossless studio master, review mixdown, or peak cache clusters match the active filters') }}
				</p>
				<p class="dasw__empty-hint">
					{{ t('duplicatefinder', 'Adjust the audio/DAW family filter, lower minimum size, or clear the search query to inspect other duplicate groups.') }}
				</p>
			</div>
			<button
				type="button"
				class="dasw__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset Filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="dasw__workstation">
			<div class="dasw__list-pane">
				<div class="dasw__pane-header">
					<span class="dasw__pane-title">
						{{ t('duplicatefinder', 'DAW Session, Stem & Peak Clusters ({count})', { count: analysis.clusters.length }) }}
					</span>
				</div>

				<div class="dasw__cluster-list">
					<button
						v-for="cluster in visibleClusters"
						:key="cluster.groupKey"
						type="button"
						class="dasw__cluster-item"
						:class="{ 'is-selected': selectedCluster && selectedCluster.groupKey === cluster.groupKey }"
						@click="selectedClusterKey = cluster.groupKey">
						<div class="dasw__cluster-top">
							<span class="dasw__cluster-name">{{ cluster.displayName }}</span>
							<span
								class="dasw__pill"
								:class="`is-risk-${cluster.clusterRiskState}`">
								{{ formatRiskLabel(cluster.clusterRiskState) }}
							</span>
						</div>
						<div class="dasw__cluster-meta">
							<span>{{ cluster.familyLabel }}</span>
							<span>{{ cluster.lineageStem }}</span>
							<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
							<span>{{ cluster.formattedReclaimableBytes }}</span>
						</div>
						<div
							v-if="cluster.survivor"
							class="dasw__cluster-path">
							{{ cluster.survivor.normalizedPath }}
						</div>
					</button>
				</div>

				<div
					v-if="analysis.clusters.length > visibleLimit"
					class="dasw__load-more-wrap">
					<button
						type="button"
						class="dasw__tool-btn"
						@click="visibleLimit += 25">
						<span>{{ t('duplicatefinder', 'Load more ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="selectedCluster"
				class="dasw__inspector-pane">
				<header class="dasw__inspector-header">
					<div class="dasw__inspector-title-wrap">
						<h4 class="dasw__inspector-title">
							{{ selectedCluster.displayName }}
						</h4>
						<span class="dasw__inspector-sub">
							{{ selectedCluster.familyLabel }} / .{{ selectedCluster.extension || 'dir' }} / {{ selectedCluster.lineageStem }}
						</span>
					</div>

					<div class="dasw__inspector-actions">
						<button
							type="button"
							class="dasw__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Focus Group') }}</span>
						</button>
						<button
							type="button"
							class="dasw__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Compare Copies') }}</span>
						</button>
					</div>
				</header>

				<div
					v-if="selectedCluster.clusterRiskState === 'unverified-master'"
					class="dasw__warn-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'Lossless Master Conservation Guard:') }}</strong>
					{{ t('duplicatefinder', 'Lossy review exports (.mp3/.m4a/.aac/.ogg/.opus/.wma) are strictly blocked from deletion whenever no verified lossless master sharing the same lineageStem is conserved.') }}
				</div>

				<div
					v-if="selectedCluster.hasMasterVault || selectedCluster.hasActiveDaw"
					class="dasw__info-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'Studio Master & Active Session Guard:') }}</strong>
					{{ t('duplicatefinder', 'Released Studio Masters / ISRC Vault copies and active DAW session project trees (.als/.flp/.logicx/.ptx/.cpr/.rpp/.sesx, Audio Files/, Samples/) are strictly protected by default.') }}
				</div>

				<div class="dasw__meta-grid">
					<div class="dasw__meta-item">
						<span class="dasw__meta-label">{{ t('duplicatefinder', 'Lineage Stem') }}</span>
						<span>{{ selectedCluster.lineageStem }}</span>
					</div>
					<div class="dasw__meta-item">
						<span class="dasw__meta-label">{{ t('duplicatefinder', 'Studio & Format Tags') }}</span>
						<span>{{ selectedCluster.artifactSummary }}</span>
					</div>
					<div class="dasw__meta-item">
						<span class="dasw__meta-label">{{ t('duplicatefinder', 'Governance Tiers Present') }}</span>
						<span>{{ selectedCluster.governanceSummary }}</span>
					</div>
					<div class="dasw__meta-item">
						<span class="dasw__meta-label">{{ t('duplicatefinder', 'Canonical Studio Anchor') }}</span>
						<span class="dasw__mono-text">{{ selectedCluster.survivor ? selectedCluster.survivor.normalizedPath : '-' }}</span>
					</div>
					<div class="dasw__meta-item">
						<span class="dasw__meta-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<span>{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableCopiesCount }} / {{ selectedCluster.copyCount }})</span>
					</div>
				</div>

				<div class="dasw__member-list">
					<article
						v-for="member in selectedCluster.members"
						:key="member.selectionKey"
						class="dasw__member-card"
						:class="`is-verdict-${member.verdict}`">
						<div class="dasw__member-top">
							<span class="dasw__member-name">{{ member.basename }}</span>
							<div class="dasw__member-badges">
								<span
									class="dasw__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdictLabel }}
								</span>
								<span
									class="dasw__pill"
									:class="authorityPillClass(member.context.authorityScore)">
									{{ t('duplicatefinder', 'Authority {score}', { score: member.context.authorityScore }) }}
								</span>
							</div>
						</div>

						<div class="dasw__member-path">
							{{ member.normalizedPath }}
						</div>

						<div class="dasw__member-meta">
							<span>{{ member.tierLabel }}</span>
							<span>{{ member.formattedSize }}</span>
							<span v-if="member.context.ageDays !== null">{{ member.context.ageDays }}d {{ t('duplicatefinder', 'old') }}</span>
							<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
						</div>

						<div class="dasw__companion-chips">
							<span class="dasw__companion-chip">{{ member.context.lineageStem }}</span>
							<span
								v-if="member.context.artifactTag !== 'none'"
								class="dasw__companion-chip">
								{{ member.context.artifactTag }}
							</span>
							<span
								v-if="member.context.isReleasedMasterVault || member.context.isIsrcMaster"
								class="dasw__companion-chip is-warn">
								{{ t('duplicatefinder', 'Released Master / ISRC') }}
							</span>
							<span
								v-if="member.context.isActiveDawSession"
								class="dasw__companion-chip is-warn">
								{{ t('duplicatefinder', 'Active DAW Session') }}
							</span>
							<span
								v-if="member.context.isLosslessMaster"
								class="dasw__companion-chip">
								{{ t('duplicatefinder', 'Verified Lossless Master') }}
							</span>
							<span
								v-if="member.context.isLossyTranscode"
								class="dasw__companion-chip">
								{{ member.context.hasVerifiedLosslessMaster ? t('duplicatefinder', 'Lossless Master Verified') : t('duplicatefinder', 'No Lossless Master Conserved') }}
							</span>
							<span
								v-if="member.context.isPeakFreezeCache"
								class="dasw__companion-chip">
								{{ t('duplicatefinder', 'Peak / Freeze Cache') }}
							</span>
						</div>

						<p class="dasw__member-note">
							{{ member.note }}
						</p>

						<div class="dasw__override-bar">
							<span class="dasw__control-label">{{ t('duplicatefinder', 'Operator Override:') }}</span>
							<button
								type="button"
								class="dasw__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'auto' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'auto' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'auto')">
								<span>{{ t('duplicatefinder', 'Auto') }}</span>
							</button>
							<button
								type="button"
								class="dasw__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'force-keep' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'force-keep' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'force-keep')">
								<span>{{ t('duplicatefinder', 'Shield Copy') }}</span>
							</button>
							<button
								type="button"
								class="dasw__seg-btn"
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
			class="dasw__script-box">
			<summary class="dasw__script-summary">
				{{ t('duplicatefinder', 'POSIX DRY_RUN=1 Script (sha256sum -- + stat cross-device + occ files:scan) & .sync-exclude.lst') }}
			</summary>
			<div class="dasw__script-content">
				<div class="dasw__script-actions">
					<button
						type="button"
						class="dasw__tool-btn"
						@click="copyRemediationScript">
						<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
					</button>
					<button
						type="button"
						class="dasw__tool-btn"
						@click="copySyncExcludeSnippet">
						<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
					</button>
				</div>
				<pre class="dasw__code-pre"><code>{{ generatedScript }}</code></pre>
				<pre class="dasw__code-pre"><code>{{ generatedSyncExclude }}</code></pre>
			</div>
		</details>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	DAW_AUDIO_FAMILY_META,
	DAW_AUDIO_PRESETS,
	analyzeDawAudioDuplicates,
	buildDawAudioCsvReport,
	buildDawAudioJsonReport,
	buildDawAudioScript,
	buildDawAudioSyncExcludeSnippet,
} from '../tools/dawAudioStemAuditor'

export default {
	name: 'DawAudioStemWorkbench',
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
			presetId: 'all-daw-audio-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'consolidate-studio-masters',
			survivorRule: 'master-vault-and-daw-first',
			protectReleasedMasterVault: true,
			protectActiveDawSession: true,
			protectVerifiedLosslessMaster: true,
			keepRecentRevisionsInput: '2',
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
			return DAW_AUDIO_PRESETS
		},
		familyOptions() {
			return Object.values(DAW_AUDIO_FAMILY_META)
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable / Consolidatable') },
				{ id: 'master-vault', label: this.t('duplicatefinder', 'Master / ISRC Vault') },
				{ id: 'active-daw', label: this.t('duplicatefinder', 'Active DAW Sessions') },
				{ id: 'lossy-twins', label: this.t('duplicatefinder', 'Lossy Review Twins') },
				{ id: 'peak-cache', label: this.t('duplicatefinder', 'Peak & Freeze Caches') },
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
		parsedKeepRecentRevisions() {
			const trimmed = String(this.keepRecentRevisionsInput ?? '').trim()
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
			return analyzeDawAudioDuplicates(this.activePool, {
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectReleasedMasterVault: this.protectReleasedMasterVault,
				protectActiveDawSession: this.protectActiveDawSession,
				protectVerifiedLosslessMaster: this.protectVerifiedLosslessMaster,
				keepRecentRevisions: this.parsedKeepRecentRevisions,
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
			return buildDawAudioScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
		generatedSyncExclude() {
			return buildDawAudioSyncExcludeSnippet(this.analysis)
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
			const preset = DAW_AUDIO_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectReleasedMasterVault = preset.protectReleasedMasterVault
			this.protectActiveDawSession = preset.protectActiveDawSession
			this.protectVerifiedLosslessMaster = preset.protectVerifiedLosslessMaster
			this.keepRecentRevisionsInput = String(preset.keepRecentRevisions)
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
				'master-vault': this.t('duplicatefinder', 'Master Vaulted'),
				'active-daw': this.t('duplicatefinder', 'DAW Active'),
				'unverified-master': this.t('duplicatefinder', 'Lossless Unverified'),
				'lossy-verified': this.t('duplicatefinder', 'Lossy Verified'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		verdictPillClass(verdict) {
			if (verdict === 'keep-canonical-survivor') {
				return 'is-keep'
			}
			if (verdict === 'blocked-released-master-vault' || verdict === 'blocked-active-daw-session') {
				return 'is-danger'
			}
			if (
				verdict === 'blocked-lossless-master-guard'
				|| verdict === 'blocked-unverified-lossless-master'
				|| verdict === 'blocked-not-peak-cache'
				|| verdict === 'blocked-fresh-peak-cache'
				|| verdict === 'blocked-not-lossy-transcode'
				|| verdict === 'blocked-manual-shield'
				|| verdict === 'excluded'
			) {
				return 'is-warn'
			}
			if (verdict === 'consolidate-to-master-vault') {
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
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Audio & DAW remediation script to clipboard.'))
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
			const csv = buildDawAudioCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-daw-audio-stem-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Audio & DAW CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildDawAudioJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-daw-audio-stem-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Audio & DAW JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.daw-audio-workbench {
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

.dasw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.dasw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.dasw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.dasw__status-badge {
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

.dasw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.dasw__tool-btn,
.dasw__seg-btn,
.dasw__chip,
.dasw__primary-btn {
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

.dasw__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, #ffffff);
}

.dasw__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.dasw__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element, #0082c9);
}

.dasw__seg-btn.is-active,
.dasw__chip.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.dasw__tool-btn:focus-visible,
.dasw__seg-btn:focus-visible,
.dasw__chip:focus-visible,
.dasw__primary-btn:focus-visible,
.dasw__cluster-item:focus-visible,
.dasw__input:focus-visible,
.dasw__script-summary:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.dasw__notice {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	font-size: 0.86rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.dasw__notice.is-success {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.dasw__notice.is-error {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.dasw__empty-banner {
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

.dasw__empty-text {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 68ch;
}

.dasw__empty-title {
	margin: 0;
	font-weight: 700;
	font-size: 0.94rem;
}

.dasw__empty-hint {
	margin: 0;
	font-size: 0.85rem;
	color: var(--color-text-maxcontrast);
	line-height: 1.45;
}

.dasw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
}

.dasw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.dasw__control-label {
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.dasw__segments,
.dasw__chip-group,
.dasw__filters-strip {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.dasw__filters-strip {
	flex-direction: column;
	gap: 8px;
}

.dasw__inputs-row {
	align-items: flex-end;
}

.dasw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.dasw__field-grow {
	flex: 1 1 200px;
}

.dasw__field-label {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.dasw__input {
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

.dasw__num-input {
	inline-size: 108px;
	max-inline-size: 100%;
}

.dasw__kpis {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 10px;
}

@media (min-width: 560px) {
	.dasw__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (min-width: 980px) {
	.dasw__kpis {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
}

.dasw__kpi {
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

.dasw__kpi-label {
	font-size: 0.76rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.dasw__kpi-val {
	font-size: 1.02rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.dasw__kpi-val.is-accent {
	color: #0b4a8b;
}

.dasw__kpi-val.is-warn {
	color: #7c4a03;
}

.dasw__workstation {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 14px;
}

@media (min-width: 1080px) {
	.dasw__workstation {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
		align-items: start;
	}
}

.dasw__list-pane,
.dasw__inspector-pane {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.dasw__pane-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.dasw__pane-title {
	font-size: 0.88rem;
	font-weight: 700;
}

.dasw__cluster-list,
.dasw__member-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.dasw__cluster-item {
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

.dasw__cluster-item.is-selected {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light);
}

.dasw__cluster-top,
.dasw__member-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.dasw__cluster-name,
.dasw__member-name {
	font-weight: 700;
	font-size: 0.9rem;
	overflow-wrap: anywhere;
}

.dasw__cluster-path,
.dasw__member-path {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.dasw__cluster-meta,
.dasw__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.dasw__pill {
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.72rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.dasw__pill.is-danger {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.dasw__pill.is-risk-master-vault,
.dasw__pill.is-risk-unverified-master,
.dasw__pill.is-risk-shielded,
.dasw__pill.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.dasw__pill.is-risk-active-daw,
.dasw__pill.is-risk-lossy-verified,
.dasw__pill.is-consolidate {
	background-color: #e8f1fb;
	color: #0b4a8b;
	border-color: #9ec5fe;
}

.dasw__pill.is-risk-reclaimable,
.dasw__pill.is-reclaim,
.dasw__pill.is-keep {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.dasw__inspector-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.dasw__inspector-title-wrap {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
}

.dasw__inspector-title {
	margin: 0;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.dasw__inspector-sub {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.dasw__inspector-actions,
.dasw__override-bar,
.dasw__member-badges,
.dasw__companion-chips {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.dasw__companion-chip {
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

.dasw__companion-chip.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.dasw__warn-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #f5c97b;
	background-color: #fff4e5;
	color: #7c4a03;
	font-size: 0.83rem;
	line-height: 1.45;
}

.dasw__info-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #9ec5fe;
	background-color: #e8f1fb;
	color: #0b4a8b;
	font-size: 0.83rem;
	line-height: 1.45;
}

.dasw__meta-grid {
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
	.dasw__meta-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

.dasw__meta-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.84rem;
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.dasw__meta-label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.dasw__mono-text {
	font-family: monospace;
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}

.dasw__member-card {
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

.dasw__member-card.is-verdict-keep-canonical-survivor,
.dasw__member-card.is-verdict-reclaim-stale-peak-cache,
.dasw__member-card.is-verdict-reclaim-lossy-twin {
	border-inline-start: 4px solid #0f5132;
}

.dasw__member-card.is-verdict-consolidate-to-master-vault {
	border-inline-start: 4px solid #0b4a8b;
}

.dasw__member-card.is-verdict-blocked-released-master-vault,
.dasw__member-card.is-verdict-blocked-active-daw-session {
	border-inline-start: 4px solid #842029;
}

.dasw__member-card.is-verdict-blocked-lossless-master-guard,
.dasw__member-card.is-verdict-blocked-unverified-lossless-master,
.dasw__member-card.is-verdict-blocked-not-peak-cache,
.dasw__member-card.is-verdict-blocked-fresh-peak-cache,
.dasw__member-card.is-verdict-blocked-not-lossy-transcode,
.dasw__member-card.is-verdict-blocked-manual-shield,
.dasw__member-card.is-verdict-excluded {
	border-inline-start: 4px solid #7c4a03;
}

.dasw__member-note {
	margin: 0;
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 68ch;
}

.dasw__script-box {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	padding-block: 8px;
	padding-inline: 12px;
	background-color: var(--color-main-background);
}

.dasw__script-summary {
	display: flex;
	align-items: center;
	min-block-size: 44px;
	font-weight: 700;
	font-size: 0.86rem;
	cursor: pointer;
}

.dasw__script-content {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block-start: 8px;
}

.dasw__script-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.dasw__code-pre {
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

.dasw__load-more-wrap {
	display: flex;
	justify-content: center;
	padding-block: 6px;
}
</style>
