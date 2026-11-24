<template>
	<section
		class="audio-daw-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Audio Production, DAW Project and Sample Library Vault Auditor')">
		<header class="adv__toolbar">
			<div class="adv__title-group">
				<h3 class="adv__title">
					{{ t('duplicatefinder', 'Audio Production, DAW Project & Sample Library Vault Auditor') }}
				</h3>
				<span
					class="adv__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {anchors} master project & 24-bit WAV anchors', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						anchors: analysis.summary.totalMasterProjectClusters + analysis.summary.total24BitWavMasterClusters,
					}) }}
				</span>
			</div>

			<div class="adv__toolbar-actions">
				<button
					type="button"
					class="adv__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="adv__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="adv__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="adv__tool-btn is-close"
					aria-keyshortcuts="Shift+J"
					:title="t('duplicatefinder', 'Hide Audio Production, DAW Project and Sample Library Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Audio DAW Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="adv__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="adv__kpis">
			<div class="adv__kpi">
				<span class="adv__kpi-label">{{ t('duplicatefinder', 'Safe Audio Vault Reclaim') }}</span>
				<strong class="adv__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="adv__kpi">
				<span class="adv__kpi-label">{{ t('duplicatefinder', 'Master Project & 24-bit WAV Anchors') }}</span>
				<strong class="adv__kpi-val is-warn">
					{{ analysis.summary.totalMasterProjectClusters }} {{ t('duplicatefinder', 'master projects') }} / {{ analysis.summary.total24BitWavMasterClusters }} {{ t('duplicatefinder', '24-bit WAV') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="adv__kpi">
				<span class="adv__kpi-label">{{ t('duplicatefinder', 'Sessions / Peak Caches / Samples') }}</span>
				<strong class="adv__kpi-val">
					{{ analysis.summary.distinctSessionsCount }} {{ t('duplicatefinder', 'sessions') }} / {{ analysis.summary.totalPeakCacheClusters }} {{ t('duplicatefinder', 'caches') }} / {{ analysis.summary.totalSampleLibraryClusters }} {{ t('duplicatefinder', 'samples') }}
				</strong>
			</div>
			<div class="adv__kpi">
				<span class="adv__kpi-label">{{ t('duplicatefinder', 'Raw Studio Footprint') }}</span>
				<strong class="adv__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="adv__empty-banner"
			role="note">
			<div class="adv__empty-text">
				<p class="adv__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure master DAW project and 24-bit WAV guards before scanning') }}
				</p>
				<p class="adv__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit duplicate DAW projects (.als/.flp/.logicx/.rpp/.cpr/.ptx), rendered stems/bounces (.wav/.aiff/.flac/.mp3), sample/instrument libraries (.sf2/.nki/.exs), and autosave/waveform peak caches (.reapeaks/.asd/.pkf, Backup/).') }}
				</p>
			</div>
			<button
				type="button"
				class="adv__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="adv__controls">
			<div class="adv__control-row">
				<span class="adv__control-label">{{ t('duplicatefinder', 'Studio Preset') }}</span>
				<div
					class="adv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Audio DAW and sample library audit presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="adv__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="adv__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="adv__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="adv__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="adv__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="adv__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="adv__seg-btn"
					:class="{ 'is-active': protectLatestMasterProject }"
					:aria-pressed="protectLatestMasterProject ? 'true' : 'false'"
					@click="protectLatestMasterProject = !protectLatestMasterProject">
					<span>{{ protectLatestMasterProject ? t('duplicatefinder', 'Shield Latest Master Project: ON') : t('duplicatefinder', 'Shield Latest Master Project: OFF') }}</span>
				</button>

				<button
					type="button"
					class="adv__seg-btn"
					:class="{ 'is-active': protect24BitWavMasters }"
					:aria-pressed="protect24BitWavMasters ? 'true' : 'false'"
					@click="protect24BitWavMasters = !protect24BitWavMasters">
					<span>{{ protect24BitWavMasters ? t('duplicatefinder', 'Shield 24-bit WAV Masters: ON') : t('duplicatefinder', 'Shield 24-bit WAV Masters: OFF') }}</span>
				</button>
			</div>

			<div class="adv__control-row adv__inputs-row">
				<label class="adv__field">
					<span class="adv__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="adv__input">
						<option value="prune-caches-and-redundant-bounces">{{ t('duplicatefinder', 'Prune Peak Caches & Redundant Bounces') }}</option>
						<option value="consolidate-sample-library-hardlinks">{{ t('duplicatefinder', 'Hardlink-Consolidate Sample Libraries') }}</option>
						<option value="prune-autosaves-and-peak-caches-only">{{ t('duplicatefinder', 'Prune Autosaves & Peak Caches Only') }}</option>
					</select>
				</label>

				<label class="adv__field">
					<span class="adv__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="adv__input">
						<option value="master-project-and-24bit-wav-first">{{ t('duplicatefinder', 'Master Project & 24-bit WAV first') }}</option>
						<option value="latest-revision-first">{{ t('duplicatefinder', 'Latest Project Revision first') }}</option>
						<option value="lossless-master-first">{{ t('duplicatefinder', 'Lossless (.wav/.aiff/.flac) first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="adv__field">
					<span class="adv__field-label">{{ t('duplicatefinder', 'Keep Project Versions') }}</span>
					<input
						v-model="keepPreviousVersionsInput"
						type="number"
						min="0"
						step="1"
						class="adv__input adv__num-input">
				</label>

				<label class="adv__field">
					<span class="adv__field-label">{{ t('duplicatefinder', 'Stale Cache (d)') }}</span>
					<input
						v-model="staleCacheDaysInput"
						type="number"
						min="0"
						step="1"
						class="adv__input adv__num-input">
				</label>

				<label class="adv__field">
					<span class="adv__field-label">{{ t('duplicatefinder', 'Min Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="adv__input adv__num-input">
				</label>

				<label class="adv__field adv__field-grow">
					<span class="adv__field-label">{{ t('duplicatefinder', 'Filter Session, DAW, Stem or Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="adv__input"
						:placeholder="t('duplicatefinder', 'e.g. Ableton, .als, .wav, .nki, .reapeaks, Backup')">
				</label>

				<label class="adv__field adv__field-grow">
					<span class="adv__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="adv__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="adv__field">
					<span class="adv__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="adv__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Master & studio risk') }}</option>
						<option value="revision_desc">{{ t('duplicatefinder', 'Highest revision') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Asset name (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="adv__control-row">
				<span class="adv__control-label">{{ t('duplicatefinder', 'Audio Family') }}</span>
				<div
					class="adv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Audio DAW family filter')">
					<button
						type="button"
						class="adv__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="adv__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="adv__control-row">
				<span class="adv__control-label">{{ t('duplicatefinder', 'Verdict') }}</span>
				<div
					class="adv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Audio DAW verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="adv__seg-btn"
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
			class="adv__empty-filter"
			role="note">
			<p class="adv__empty-title">
				{{ t('duplicatefinder', 'No DAW project, stem bounce, sample library or peak cache duplicate clusters match the active filters.') }}
			</p>
			<button
				type="button"
				class="adv__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="adv__workspace">
			<div
				class="adv__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited audio production and DAW clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="cluster.groupKey"
					type="button"
					class="adv__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.groupKey === cluster.groupKey }"
					@click="selectedClusterKey = cluster.groupKey">
					<div class="adv__cluster-top">
						<strong class="adv__cluster-name">{{ cluster.displayName }}</strong>
						<span
							class="adv__pill"
							:class="riskPillClass(cluster.riskState)">
							{{ formatRiskLabel(cluster.riskState) }}
						</span>
					</div>
					<div class="adv__cluster-meta">
						<span class="adv__tag">{{ cluster.sessionName }}</span>
						<span class="adv__tag">{{ cluster.dawHost }}</span>
						<span class="adv__tag">{{ cluster.formatBadge }}</span>
						<span
							v-if="cluster.revisionNumber > 0"
							class="adv__tag">{{ cluster.revisionLabel }}</span>
					</div>
					<div class="adv__cluster-badges">
						<span
							v-if="cluster.has24BitWavMaster"
							class="adv__badge is-danger">
							{{ t('duplicatefinder', '24-bit WAV Master') }}
						</span>
						<span
							v-if="cluster.isLatestMasterProject"
							class="adv__badge is-keep">
							{{ t('duplicatefinder', 'Latest Master Project') }}
						</span>
						<span
							v-if="cluster.family === 'daw-autosave-peak-caches'"
							class="adv__badge is-warn">
							{{ t('duplicatefinder', 'Peak / Autosave Cache') }}
						</span>
						<span
							v-if="cluster.family === 'sample-instrument-libraries'"
							class="adv__badge is-consolidate">
							{{ t('duplicatefinder', 'Sample Library') }}
						</span>
					</div>
					<div class="adv__cluster-bottom">
						<span>{{ cluster.copiesCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="adv__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="adv__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="adv__inspector">
				<header class="adv__inspector-head">
					<div class="adv__inspector-title-wrap">
						<h4 class="adv__inspector-title">
							{{ selectedCluster.displayName }}
						</h4>
						<p class="adv__inspector-sub">
							{{ selectedCluster.vaultKey }} | {{ selectedCluster.dawHost }} | {{ selectedCluster.familyLabel }}
						</p>
					</div>
					<div class="adv__inspector-actions">
						<button
							type="button"
							class="adv__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="adv__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="adv__lineage-grid">
					<div class="adv__lineage-item">
						<span class="adv__lineage-label">{{ t('duplicatefinder', 'Session & Revision') }}</span>
						<strong class="adv__lineage-val">{{ selectedCluster.sessionName }} ({{ selectedCluster.revisionLabel }})</strong>
					</div>
					<div class="adv__lineage-item">
						<span class="adv__lineage-label">{{ t('duplicatefinder', 'Stem / Sample Signature') }}</span>
						<strong class="adv__lineage-val">{{ selectedCluster.audioSignature }}</strong>
					</div>
					<div class="adv__lineage-item">
						<span class="adv__lineage-label">{{ t('duplicatefinder', 'Master Protection Status') }}</span>
						<strong class="adv__lineage-val">
							{{ selectedCluster.has24BitWavMaster ? t('duplicatefinder', '24-bit WAV Master Guard') : t('duplicatefinder', 'Standard Audio Asset') }}
							|
							{{ selectedCluster.isLatestMasterProject ? t('duplicatefinder', 'Latest Master Project') : selectedCluster.formatBadge }}
						</strong>
					</div>
					<div class="adv__lineage-item">
						<span class="adv__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="adv__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableGb }})
						</strong>
					</div>
				</div>

				<div class="adv__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.selectionKey"
						class="adv__member-card">
						<div class="adv__member-top">
							<code class="adv__member-path">{{ member.path }}</code>
							<div class="adv__member-pills">
								<span
									class="adv__pill"
									:class="authorityPillClass(member.authorityScore)">
									{{ t('duplicatefinder', 'Authority {score}', { score: member.authorityScore }) }}
								</span>
								<span
									class="adv__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdict }}
								</span>
							</div>
						</div>
						<div class="adv__member-bottom">
							<div class="adv__member-meta">
								<span>{{ member.formattedSize }}</span>
								<span>{{ member.formattedMtime }}</span>
								<span>{{ member.verdictReason }}</span>
							</div>
							<label
								v-if="member.verdict !== 'keep-canonical-survivor'"
								class="adv__override-field">
								<span class="adv__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
								<select
									class="adv__override-select"
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

				<div class="adv__code-panels">
					<div class="adv__code-box">
						<div class="adv__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="adv__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="adv__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="adv__code-box">
						<div class="adv__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="adv__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="adv__pre"><code>{{ generatedSyncExclude }}</code></pre>
					</div>
				</div>
			</div>
		</div>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	AUDIO_DAW_PRESETS,
	analyzeAudioDawVault,
	buildAudioDawCsvReport,
	buildAudioDawJsonReport,
	buildAudioDawRemediationScript,
	buildAudioDawSyncExcludeSnippet,
} from '../tools/audioDawVaultAuditor'

export default {
	name: 'AudioDawVaultWorkbench',
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
			presetId: 'all-audio-daw-vault-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-caches-and-redundant-bounces',
			survivorRule: 'master-project-and-24bit-wav-first',
			protectLatestMasterProject: true,
			protect24BitWavMasters: true,
			keepPreviousVersionsInput: '1',
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
			return AUDIO_DAW_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'master-project', label: this.t('duplicatefinder', 'Master Projects') },
				{ id: 'wav-master', label: this.t('duplicatefinder', '24-bit WAV Masters') },
				{ id: 'peak-cache', label: this.t('duplicatefinder', 'Peak Caches') },
				{ id: 'sample-library', label: this.t('duplicatefinder', 'Sample Libraries') },
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
		parsedKeepPreviousVersions() {
			const trimmed = String(this.keepPreviousVersionsInput ?? '').trim()
			if (!trimmed) {
				return 1
			}
			const parsed = Number.parseInt(trimmed, 10)
			return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1
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
			return analyzeAudioDawVault(this.activePool, {
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectLatestMasterProject: this.protectLatestMasterProject,
				protect24BitWavMasters: this.protect24BitWavMasters,
				keepPreviousProjectVersions: this.parsedKeepPreviousVersions,
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
			return buildAudioDawRemediationScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
		generatedSyncExclude() {
			return buildAudioDawSyncExcludeSnippet(this.analysis)
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
			const preset = AUDIO_DAW_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectLatestMasterProject = preset.protectLatestMasterProject
			this.protect24BitWavMasters = preset.protect24BitWavMasters
			this.keepPreviousVersionsInput = String(preset.keepPreviousProjectVersions)
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
				consolidatable: this.t('duplicatefinder', 'Hardlink Ready'),
				'cache-reclaimable': this.t('duplicatefinder', 'Stale Cache'),
				'sample-reclaimable': this.t('duplicatefinder', 'Sample Duplicate'),
				'wav-master-protected': this.t('duplicatefinder', '24-bit WAV Protected'),
				'master-project-protected': this.t('duplicatefinder', 'Master Project Protected'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		riskPillClass(riskState) {
			if (riskState === 'wav-master-protected' || riskState === 'master-project-protected') {
				return 'is-danger'
			}
			if (riskState === 'shielded') {
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
			if (verdict === 'blocked-24bit-wav-master' || verdict === 'blocked-latest-master-project') {
				return 'is-danger'
			}
			if (verdict.startsWith('blocked-')) {
				return 'is-warn'
			}
			if (verdict === 'consolidate-hardlink-sample') {
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
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Audio DAW Vault remediation script to clipboard.'))
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
			const csv = buildAudioDawCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-audio-daw-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Audio DAW Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildAudioDawJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-audio-daw-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Audio DAW Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.audio-daw-vault-workbench {
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

.adv__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.adv__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.adv__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.adv__status-badge {
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

.adv__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.adv__tool-btn,
.adv__seg-btn,
.adv__primary-btn,
.adv__load-more-btn,
.adv__mini-btn {
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

.adv__tool-btn:hover:not(:disabled),
.adv__seg-btn:hover:not(:disabled),
.adv__load-more-btn:hover:not(:disabled),
.adv__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.adv__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.adv__tool-btn.is-primary-outline,
.adv__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.adv__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.adv__tool-btn:focus-visible,
.adv__seg-btn:focus-visible,
.adv__primary-btn:focus-visible,
.adv__load-more-btn:focus-visible,
.adv__mini-btn:focus-visible,
.adv__cluster-card:focus-visible,
.adv__input:focus-visible,
.adv__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.adv__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.adv__notice.is-success {
	background-color: var(--color-background-hover);
	border-color: var(--color-success, #2d8a4e);
}

.adv__notice.is-error {
	background-color: var(--color-background-hover);
	border-color: var(--color-error, #b91c1c);
}

.adv__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.adv__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.adv__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.adv__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.adv__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.adv__kpi-val.is-warn {
	color: var(--color-warning-text, var(--color-main-text));
}

.adv__empty-banner,
.adv__empty-filter {
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

.adv__empty-text {
	flex: 1 1 240px;
	min-inline-size: 0;
}

.adv__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.adv__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.adv__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.adv__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.adv__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 96px;
}

.adv__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.adv__inputs-row {
	align-items: flex-end;
}

.adv__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.adv__field-grow {
	flex: 1 1 180px;
}

.adv__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.adv__input,
.adv__override-select {
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

.adv__num-input {
	inline-size: 96px;
}

.adv__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.adv__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.adv__cluster-card {
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

.adv__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.adv__cluster-top,
.adv__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.adv__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.adv__cluster-meta,
.adv__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.adv__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.adv__badge,
.adv__pill {
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

.adv__pill.is-keep,
.adv__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.adv__pill.is-danger,
.adv__badge.is-danger {
	border-color: var(--color-error, #b91c1c);
}

.adv__pill.is-consolidate,
.adv__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.adv__pill.is-warn,
.adv__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.adv__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.adv__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.adv__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.adv__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.adv__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.adv__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.adv__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.adv__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.adv__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.adv__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.adv__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.adv__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.adv__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.adv__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.adv__member-top,
.adv__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.adv__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.adv__member-pills {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.adv__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.adv__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.adv__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.adv__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.adv__pre {
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

.adv__sr-only {
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
	.adv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.adv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.adv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.audio-daw-vault-workbench {
		padding: 10px;
	}

	.adv__kpis,
	.adv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.adv__num-input {
		inline-size: 100%;
	}

	.adv__field {
		flex: 1 1 100%;
	}
}
</style>
