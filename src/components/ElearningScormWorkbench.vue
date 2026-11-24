<template>
	<section
		class="elearning-scorm-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'E-Learning SCORM/H5P Package, Lecture Recording Transcode and Slide Deck Handout Auditor')">
		<header class="esw__toolbar">
			<div class="esw__title-group">
				<h3 class="esw__title">
					{{ t('duplicatefinder', 'E-Learning SCORM/H5P, Lecture Transcode & Slide Handout Auditor') }}
				</h3>
				<span
					class="esw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} reclaimable / {vault} LMS-vaulted', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						vault: analysis.summary.totalLmsVaultClusters,
					}) }}
				</span>
			</div>

			<div class="esw__toolbar-actions">
				<button
					type="button"
					class="esw__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="esw__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="esw__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="esw__tool-btn is-close"
					aria-keyshortcuts="Shift+L"
					:title="t('duplicatefinder', 'Hide E-Learning SCORM/H5P Package, Lecture Recording Transcode and Slide Deck Handout Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Courses & SCORM') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="esw__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="esw__empty-banner"
			role="note">
			<div class="esw__empty-text">
				<p class="esw__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure Published LMS Vault, Master Recording and Editable Deck guards before scanning') }}
				</p>
				<p class="esw__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit LMS packages (.scorm.zip/imsmanifest.xml/.h5p/.mbz/.imscc), lecture recording masters vs transcodes (.mov/.mkv/.mp4 vs _1080p/_720p/_480p/.m4a), slide decks vs handouts (.pptx/.key/.odp vs _slides/_handout/_notes.pdf), and caption/QTI staging (.vtt/.srt/.qti.xml/~$*.pptx/.tmp).') }}
				</p>
			</div>
			<button
				type="button"
				class="esw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="esw__controls">
			<div class="esw__control-row">
				<span class="esw__control-label">{{ t('duplicatefinder', 'Audit Preset') }}</span>
				<div
					class="esw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'E-learning audit presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="esw__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="esw__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="esw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="esw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="esw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="esw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="esw__seg-btn"
					:class="{ 'is-active': protectPublishedLmsVault }"
					:aria-pressed="protectPublishedLmsVault ? 'true' : 'false'"
					@click="protectPublishedLmsVault = !protectPublishedLmsVault">
					<span>{{ protectPublishedLmsVault ? t('duplicatefinder', 'Published LMS Vault Guard: ON') : t('duplicatefinder', 'Published LMS Vault Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="esw__seg-btn"
					:class="{ 'is-active': protectMasterRecordingSource }"
					:aria-pressed="protectMasterRecordingSource ? 'true' : 'false'"
					@click="protectMasterRecordingSource = !protectMasterRecordingSource">
					<span>{{ protectMasterRecordingSource ? t('duplicatefinder', 'Master Recording Guard: ON') : t('duplicatefinder', 'Master Recording Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="esw__seg-btn"
					:class="{ 'is-active': protectEditableDeckOrigin }"
					:aria-pressed="protectEditableDeckOrigin ? 'true' : 'false'"
					@click="protectEditableDeckOrigin = !protectEditableDeckOrigin">
					<span>{{ protectEditableDeckOrigin ? t('duplicatefinder', 'Editable Deck Guard: ON') : t('duplicatefinder', 'Editable Deck Guard: OFF') }}</span>
				</button>
			</div>

			<div class="esw__control-row esw__inputs-row">
				<label class="esw__field">
					<span class="esw__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="esw__input">
						<option value="consolidate-lms-masters">{{ t('duplicatefinder', 'Consolidate LMS & Course Masters') }}</option>
						<option value="prune-lecture-transcodes-when-source-verified">{{ t('duplicatefinder', 'Prune Lecture Transcodes When Master Verified') }}</option>
						<option value="hardlink-handout-exports">{{ t('duplicatefinder', 'Hardlink Handout Exports When Deck Verified') }}</option>
					</select>
				</label>

				<label class="esw__field">
					<span class="esw__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="esw__input">
						<option value="lms-vault-and-source-first">{{ t('duplicatefinder', 'LMS Vault & Source Assets first') }}</option>
						<option value="master-recording-first">{{ t('duplicatefinder', 'Master Recording Source first') }}</option>
						<option value="editable-deck-first">{{ t('duplicatefinder', 'Editable Slide Deck first') }}</option>
						<option value="newest-course-first">{{ t('duplicatefinder', 'Newest course timestamp first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="esw__field">
					<span class="esw__field-label">{{ t('duplicatefinder', 'Keep Staging') }}</span>
					<input
						v-model="keepRecentStagingInput"
						type="number"
						min="1"
						step="1"
						class="esw__input esw__num-input">
				</label>

				<label class="esw__field">
					<span class="esw__field-label">{{ t('duplicatefinder', 'Stale Staging (d)') }}</span>
					<input
						v-model="staleCacheDaysInput"
						type="number"
						min="0"
						step="1"
						class="esw__input esw__num-input">
				</label>

				<label class="esw__field">
					<span class="esw__field-label">{{ t('duplicatefinder', 'Min Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="esw__input esw__num-input">
				</label>

				<label class="esw__field esw__field-grow">
					<span class="esw__field-label">{{ t('duplicatefinder', 'Filter Lesson Stem, Tag or Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="esw__input"
						:placeholder="t('duplicatefinder', 'e.g. scorm, _720p, _handout.pdf, .h5p, Accredited-LMS')">
				</label>

				<label class="esw__field esw__field-grow">
					<span class="esw__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="esw__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="esw__field">
					<span class="esw__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="esw__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'LMS & source risk') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Course asset name (A-Z)') }}</option>
					</select>
				</label>
			</div>
		</div>

		<div class="esw__kpis">
			<div class="esw__kpi">
				<span class="esw__kpi-label">{{ t('duplicatefinder', 'Safe Course Reclaim') }}</span>
				<strong class="esw__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="esw__kpi">
				<span class="esw__kpi-label">{{ t('duplicatefinder', 'LMS Vaults & Master Sources') }}</span>
				<strong class="esw__kpi-val is-warn">
					{{ analysis.summary.totalLmsVaultClusters }} {{ t('duplicatefinder', 'LMS vaults') }} / {{ analysis.summary.totalProtectedSourceClusters }} {{ t('duplicatefinder', 'source masters') }}
				</strong>
			</div>
			<div class="esw__kpi">
				<span class="esw__kpi-label">{{ t('duplicatefinder', 'Transcodes, Handouts & Staging') }}</span>
				<strong class="esw__kpi-val">
					{{ analysis.summary.totalTranscodeHandoutClusters }} {{ t('duplicatefinder', 'twins') }} / {{ analysis.summary.totalCourseStagingClusters }} {{ t('duplicatefinder', 'staging') }}
				</strong>
			</div>
			<div class="esw__kpi">
				<span class="esw__kpi-label">{{ t('duplicatefinder', 'Raw Course Footprint') }}</span>
				<strong class="esw__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty"
			class="esw__filters-strip">
			<div
				class="esw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by e-learning artifact family')">
				<button
					type="button"
					class="esw__chip"
					:class="{ 'is-active': familyFilter === 'all' }"
					:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
					@click="familyFilter = 'all'">
					<span>{{ t('duplicatefinder', 'All Courses & SCORM ({count})', { count: analysis.summary.familyCounts.all || 0 }) }}</span>
				</button>
				<button
					v-for="familyItem in familyOptions"
					:key="familyItem.id"
					type="button"
					class="esw__chip"
					:class="{ 'is-active': familyFilter === familyItem.id }"
					:aria-pressed="familyFilter === familyItem.id ? 'true' : 'false'"
					@click="familyFilter = familyItem.id">
					<span>{{ familyItem.label }} ({{ analysis.summary.familyCounts[familyItem.id] || 0 }})</span>
				</button>
			</div>

			<div
				class="esw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by e-learning audit verdict')">
				<button
					v-for="verdictOpt in verdictFilterOptions"
					:key="verdictOpt.id"
					type="button"
					class="esw__chip"
					:class="{ 'is-active': verdictFilter === verdictOpt.id }"
					:aria-pressed="verdictFilter === verdictOpt.id ? 'true' : 'false'"
					@click="verdictFilter = verdictOpt.id">
					<span>{{ verdictOpt.label }}</span>
				</button>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty && analysis.clusters.length === 0"
			class="esw__empty-banner"
			role="note">
			<div class="esw__empty-text">
				<p class="esw__empty-title">
					{{ t('duplicatefinder', 'No LMS packages, lecture transcodes, slide handouts, or course staging artifacts match the active filters') }}
				</p>
				<p class="esw__empty-hint">
					{{ t('duplicatefinder', 'Adjust the e-learning family filter, lower minimum size, or clear the search query to inspect other duplicate groups.') }}
				</p>
			</div>
			<button
				type="button"
				class="esw__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset Filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="esw__workstation">
			<div class="esw__list-pane">
				<div class="esw__pane-header">
					<span class="esw__pane-title">
						{{ t('duplicatefinder', 'Course, SCORM & Handout Clusters ({count})', { count: analysis.clusters.length }) }}
					</span>
				</div>

				<div class="esw__cluster-list">
					<button
						v-for="cluster in visibleClusters"
						:key="cluster.groupKey"
						type="button"
						class="esw__cluster-item"
						:class="{ 'is-selected': selectedCluster && selectedCluster.groupKey === cluster.groupKey }"
						@click="selectedClusterKey = cluster.groupKey">
						<div class="esw__cluster-top">
							<span class="esw__cluster-name">{{ cluster.displayName }}</span>
							<span
								class="esw__pill"
								:class="`is-risk-${cluster.clusterRiskState}`">
								{{ formatRiskLabel(cluster.clusterRiskState) }}
							</span>
						</div>
						<div class="esw__cluster-meta">
							<span>{{ cluster.familyLabel }}</span>
							<span>{{ cluster.lessonLineageStem }}</span>
							<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
							<span>{{ cluster.formattedReclaimableBytes }}</span>
						</div>
						<div
							v-if="cluster.survivor"
							class="esw__cluster-path">
							{{ cluster.survivor.normalizedPath }}
						</div>
					</button>
				</div>

				<div
					v-if="analysis.clusters.length > visibleLimit"
					class="esw__load-more-wrap">
					<button
						type="button"
						class="esw__tool-btn"
						@click="visibleLimit += 25">
						<span>{{ t('duplicatefinder', 'Load more ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="selectedCluster"
				class="esw__inspector-pane">
				<header class="esw__inspector-header">
					<div class="esw__inspector-title-wrap">
						<h4 class="esw__inspector-title">
							{{ selectedCluster.displayName }}
						</h4>
						<span class="esw__inspector-sub">
							{{ selectedCluster.familyLabel }} / .{{ selectedCluster.extension || 'dir' }} / {{ selectedCluster.lessonLineageStem }}
						</span>
					</div>

					<div class="esw__inspector-actions">
						<button
							type="button"
							class="esw__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Focus Group') }}</span>
						</button>
						<button
							type="button"
							class="esw__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Compare Copies') }}</span>
						</button>
					</div>
				</header>

				<div
					v-if="selectedCluster.clusterRiskState === 'unverified-source'"
					class="esw__warn-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'Course Source Conservation Guard:') }}</strong>
					{{ t('duplicatefinder', 'Lecture transcodes (_1080p/_720p/_480p/.m4a) and handout PDFs (_slides/_handout/_notes.pdf) are strictly blocked from deletion or hardlinking whenever no verified master recording or editable deck origin sharing the same lessonLineageStem is conserved.') }}
				</div>

				<div
					v-if="selectedCluster.hasPublishedLmsVault || selectedCluster.hasMasterRecording || selectedCluster.hasEditableDeck"
					class="esw__info-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'Published LMS, Master Recording & Editable Deck Guard:') }}</strong>
					{{ t('duplicatefinder', 'Accredited-LMS/Course-Releases packages (.scorm.zip/imsmanifest.xml/.h5p/.mbz/.imscc), master lecture recordings (.mov/.mkv/.mp4), and editable slide decks (.pptx/.key/.odp) are strictly protected by default.') }}
				</div>

				<div class="esw__meta-grid">
					<div class="esw__meta-item">
						<span class="esw__meta-label">{{ t('duplicatefinder', 'Lesson Lineage Stem') }}</span>
						<span>{{ selectedCluster.lessonLineageStem }}</span>
					</div>
					<div class="esw__meta-item">
						<span class="esw__meta-label">{{ t('duplicatefinder', 'Pedagogical & Format Tags') }}</span>
						<span>{{ selectedCluster.artifactSummary }}</span>
					</div>
					<div class="esw__meta-item">
						<span class="esw__meta-label">{{ t('duplicatefinder', 'Governance Tiers Present') }}</span>
						<span>{{ selectedCluster.governanceSummary }}</span>
					</div>
					<div class="esw__meta-item">
						<span class="esw__meta-label">{{ t('duplicatefinder', 'Canonical Course Anchor') }}</span>
						<span class="esw__mono-text">{{ selectedCluster.survivor ? selectedCluster.survivor.normalizedPath : '-' }}</span>
					</div>
					<div class="esw__meta-item">
						<span class="esw__meta-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<span>{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableCopiesCount }} / {{ selectedCluster.copyCount }})</span>
					</div>
				</div>

				<div class="esw__member-list">
					<article
						v-for="member in selectedCluster.members"
						:key="member.selectionKey"
						class="esw__member-card"
						:class="`is-verdict-${member.verdict}`">
						<div class="esw__member-top">
							<span class="esw__member-name">{{ member.basename }}</span>
							<div class="esw__member-badges">
								<span
									class="esw__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdictLabel }}
								</span>
								<span
									class="esw__pill"
									:class="authorityPillClass(member.context.authorityScore)">
									{{ t('duplicatefinder', 'Authority {score}', { score: member.context.authorityScore }) }}
								</span>
							</div>
						</div>

						<div class="esw__member-path">
							{{ member.normalizedPath }}
						</div>

						<div class="esw__member-meta">
							<span>{{ member.tierLabel }}</span>
							<span>{{ member.formattedSize }}</span>
							<span v-if="member.context.ageDays !== null">{{ member.context.ageDays }}d {{ t('duplicatefinder', 'old') }}</span>
							<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
						</div>

						<div class="esw__companion-chips">
							<span class="esw__companion-chip">{{ member.context.lessonLineageStem }}</span>
							<span
								v-if="member.context.artifactTag !== 'none'"
								class="esw__companion-chip">
								{{ member.context.artifactTag }}
							</span>
							<span
								v-if="member.context.isPublishedLmsVault"
								class="esw__companion-chip is-warn">
								{{ t('duplicatefinder', 'Published LMS Vault') }}
							</span>
							<span
								v-if="member.context.isMasterRecordingSource"
								class="esw__companion-chip is-warn">
								{{ t('duplicatefinder', 'Master Recording Source') }}
							</span>
							<span
								v-if="member.context.isEditableDeckOrigin"
								class="esw__companion-chip is-warn">
								{{ t('duplicatefinder', 'Editable Deck Origin') }}
							</span>
							<span
								v-if="member.context.isLectureTranscodeTwin"
								class="esw__companion-chip">
								{{ member.context.hasVerifiedMasterRecording ? t('duplicatefinder', 'Master Recording Verified') : t('duplicatefinder', 'No Master Recording Conserved') }}
							</span>
							<span
								v-if="member.context.isHandoutExportTwin"
								class="esw__companion-chip">
								{{ member.context.hasVerifiedEditableDeck ? t('duplicatefinder', 'Editable Deck Verified') : t('duplicatefinder', 'No Editable Deck Conserved') }}
							</span>
							<span
								v-if="member.context.isCourseStaging"
								class="esw__companion-chip">
								{{ member.context.isLockOrTempArtifact ? t('duplicatefinder', 'Lock / Temp Artifact') : t('duplicatefinder', 'Caption / QTI Staging') }}
							</span>
						</div>

						<p class="esw__member-note">
							{{ member.note }}
						</p>

						<div class="esw__override-bar">
							<span class="esw__control-label">{{ t('duplicatefinder', 'Operator Override:') }}</span>
							<button
								type="button"
								class="esw__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'auto' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'auto' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'auto')">
								<span>{{ t('duplicatefinder', 'Auto') }}</span>
							</button>
							<button
								type="button"
								class="esw__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'force-keep' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'force-keep' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'force-keep')">
								<span>{{ t('duplicatefinder', 'Shield Copy') }}</span>
							</button>
							<button
								type="button"
								class="esw__seg-btn"
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
			class="esw__script-box">
			<summary class="esw__script-summary">
				{{ t('duplicatefinder', 'POSIX DRY_RUN=1 Script (sha256sum -- + stat cross-device + occ files:scan) & .sync-exclude.lst') }}
			</summary>
			<div class="esw__script-content">
				<div class="esw__script-actions">
					<button
						type="button"
						class="esw__tool-btn"
						@click="copyRemediationScript">
						<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
					</button>
					<button
						type="button"
						class="esw__tool-btn"
						@click="copySyncExcludeSnippet">
						<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
					</button>
				</div>
				<pre class="esw__code-pre"><code>{{ generatedScript }}</code></pre>
				<pre class="esw__code-pre"><code>{{ generatedSyncExclude }}</code></pre>
			</div>
		</details>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	ELEARNING_SCORM_FAMILY_META,
	ELEARNING_SCORM_PRESETS,
	analyzeElearningScormDuplicates,
	buildElearningScormCsvReport,
	buildElearningScormJsonReport,
	buildElearningScormScript,
	buildElearningScormSyncExcludeSnippet,
} from '../tools/elearningScormAuditor'

export default {
	name: 'ElearningScormWorkbench',
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
			presetId: 'all-elearning-scorm-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'consolidate-lms-masters',
			survivorRule: 'lms-vault-and-source-first',
			protectPublishedLmsVault: true,
			protectMasterRecordingSource: true,
			protectEditableDeckOrigin: true,
			keepRecentStagingInput: '2',
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
			return ELEARNING_SCORM_PRESETS
		},
		familyOptions() {
			return Object.values(ELEARNING_SCORM_FAMILY_META)
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable / Consolidatable') },
				{ id: 'lms-vault', label: this.t('duplicatefinder', 'Published LMS Vaults') },
				{ id: 'master-recording', label: this.t('duplicatefinder', 'Master Recordings') },
				{ id: 'editable-deck', label: this.t('duplicatefinder', 'Editable Decks') },
				{ id: 'transcode-handout', label: this.t('duplicatefinder', 'Transcodes & Handouts') },
				{ id: 'course-staging', label: this.t('duplicatefinder', 'Captions & Staging') },
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
		parsedKeepRecentStaging() {
			const trimmed = String(this.keepRecentStagingInput ?? '').trim()
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
			return analyzeElearningScormDuplicates(this.activePool, {
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectPublishedLmsVault: this.protectPublishedLmsVault,
				protectMasterRecordingSource: this.protectMasterRecordingSource,
				protectEditableDeckOrigin: this.protectEditableDeckOrigin,
				keepRecentStaging: this.parsedKeepRecentStaging,
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
			return buildElearningScormScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
		generatedSyncExclude() {
			return buildElearningScormSyncExcludeSnippet(this.analysis)
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
			const preset = ELEARNING_SCORM_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectPublishedLmsVault = preset.protectPublishedLmsVault
			this.protectMasterRecordingSource = preset.protectMasterRecordingSource
			this.protectEditableDeckOrigin = preset.protectEditableDeckOrigin
			this.keepRecentStagingInput = String(preset.keepRecentStaging)
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
				'lms-vault': this.t('duplicatefinder', 'LMS Vaulted'),
				'master-recording': this.t('duplicatefinder', 'Master Recording'),
				'editable-deck': this.t('duplicatefinder', 'Editable Deck'),
				'unverified-source': this.t('duplicatefinder', 'Source Unverified'),
				'source-verified': this.t('duplicatefinder', 'Source Verified'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		verdictPillClass(verdict) {
			if (verdict === 'keep-canonical-survivor') {
				return 'is-keep'
			}
			if (
				verdict === 'blocked-published-lms-vault'
				|| verdict === 'blocked-master-recording-source'
				|| verdict === 'blocked-editable-deck-origin'
			) {
				return 'is-danger'
			}
			if (
				verdict === 'blocked-unverified-master-recording'
				|| verdict === 'blocked-unverified-editable-deck'
				|| verdict === 'blocked-not-lecture-transcode'
				|| verdict === 'blocked-not-handout-export'
				|| verdict === 'blocked-fresh-course-staging'
				|| verdict === 'blocked-manual-shield'
				|| verdict === 'excluded'
			) {
				return 'is-warn'
			}
			if (
				verdict === 'consolidate-to-lms-vault'
				|| verdict === 'hardlink-verified-handout-export'
			) {
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
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 E-Learning & SCORM remediation script to clipboard.'))
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
			const csv = buildElearningScormCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-elearning-scorm-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe E-Learning & SCORM CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildElearningScormJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-elearning-scorm-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported E-Learning & SCORM JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.elearning-scorm-workbench {
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

.esw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.esw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.esw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.esw__status-badge {
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

.esw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.esw__tool-btn,
.esw__seg-btn,
.esw__chip,
.esw__primary-btn {
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

.esw__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, #ffffff);
}

.esw__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.esw__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element, #0082c9);
}

.esw__seg-btn.is-active,
.esw__chip.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.esw__tool-btn:focus-visible,
.esw__seg-btn:focus-visible,
.esw__chip:focus-visible,
.esw__primary-btn:focus-visible,
.esw__cluster-item:focus-visible,
.esw__input:focus-visible,
.esw__script-summary:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.esw__notice {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	font-size: 0.86rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.esw__notice.is-success {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.esw__notice.is-error {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.esw__empty-banner {
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

.esw__empty-text {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 68ch;
}

.esw__empty-title {
	margin: 0;
	font-weight: 700;
	font-size: 0.94rem;
}

.esw__empty-hint {
	margin: 0;
	font-size: 0.85rem;
	color: var(--color-text-maxcontrast);
	line-height: 1.45;
}

.esw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
}

.esw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.esw__control-label {
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.esw__segments,
.esw__chip-group,
.esw__filters-strip {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.esw__filters-strip {
	flex-direction: column;
	gap: 8px;
}

.esw__inputs-row {
	align-items: flex-end;
}

.esw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.esw__field-grow {
	flex: 1 1 200px;
}

.esw__field-label {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.esw__input {
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

.esw__num-input {
	inline-size: 108px;
	max-inline-size: 100%;
}

.esw__kpis {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 10px;
}

@media (min-width: 560px) {
	.esw__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (min-width: 980px) {
	.esw__kpis {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
}

.esw__kpi {
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

.esw__kpi-label {
	font-size: 0.76rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.esw__kpi-val {
	font-size: 1.02rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.esw__kpi-val.is-accent {
	color: #0b4a8b;
}

.esw__kpi-val.is-warn {
	color: #7c4a03;
}

.esw__workstation {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 14px;
}

@media (min-width: 1080px) {
	.esw__workstation {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
		align-items: start;
	}
}

.esw__list-pane,
.esw__inspector-pane {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.esw__pane-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.esw__pane-title {
	font-size: 0.88rem;
	font-weight: 700;
}

.esw__cluster-list,
.esw__member-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.esw__cluster-item {
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

.esw__cluster-item.is-selected {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light);
}

.esw__cluster-top,
.esw__member-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.esw__cluster-name,
.esw__member-name {
	font-weight: 700;
	font-size: 0.9rem;
	overflow-wrap: anywhere;
}

.esw__cluster-path,
.esw__member-path {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.esw__cluster-meta,
.esw__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.esw__pill {
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.72rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.esw__pill.is-danger {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.esw__pill.is-risk-lms-vault,
.esw__pill.is-risk-unverified-source,
.esw__pill.is-risk-shielded,
.esw__pill.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.esw__pill.is-risk-master-recording,
.esw__pill.is-risk-editable-deck,
.esw__pill.is-risk-source-verified,
.esw__pill.is-consolidate {
	background-color: #e8f1fb;
	color: #0b4a8b;
	border-color: #9ec5fe;
}

.esw__pill.is-risk-reclaimable,
.esw__pill.is-reclaim,
.esw__pill.is-keep {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.esw__inspector-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.esw__inspector-title-wrap {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
}

.esw__inspector-title {
	margin: 0;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.esw__inspector-sub {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.esw__inspector-actions,
.esw__override-bar,
.esw__member-badges,
.esw__companion-chips {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.esw__companion-chip {
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

.esw__companion-chip.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.esw__warn-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #f5c97b;
	background-color: #fff4e5;
	color: #7c4a03;
	font-size: 0.83rem;
	line-height: 1.45;
}

.esw__info-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #9ec5fe;
	background-color: #e8f1fb;
	color: #0b4a8b;
	font-size: 0.83rem;
	line-height: 1.45;
}

.esw__meta-grid {
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
	.esw__meta-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

.esw__meta-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.84rem;
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.esw__meta-label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.esw__mono-text {
	font-family: monospace;
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}

.esw__member-card {
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

.esw__member-card.is-verdict-keep-canonical-survivor,
.esw__member-card.is-verdict-reclaim-verified-lecture-transcode,
.esw__member-card.is-verdict-reclaim-course-staging {
	border-inline-start: 4px solid #0f5132;
}

.esw__member-card.is-verdict-consolidate-to-lms-vault,
.esw__member-card.is-verdict-hardlink-verified-handout-export {
	border-inline-start: 4px solid #0b4a8b;
}

.esw__member-card.is-verdict-blocked-published-lms-vault,
.esw__member-card.is-verdict-blocked-master-recording-source,
.esw__member-card.is-verdict-blocked-editable-deck-origin {
	border-inline-start: 4px solid #842029;
}

.esw__member-card.is-verdict-blocked-unverified-master-recording,
.esw__member-card.is-verdict-blocked-unverified-editable-deck,
.esw__member-card.is-verdict-blocked-not-lecture-transcode,
.esw__member-card.is-verdict-blocked-not-handout-export,
.esw__member-card.is-verdict-blocked-fresh-course-staging,
.esw__member-card.is-verdict-blocked-manual-shield,
.esw__member-card.is-verdict-excluded {
	border-inline-start: 4px solid #7c4a03;
}

.esw__member-note {
	margin: 0;
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 68ch;
}

.esw__script-box {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	padding-block: 8px;
	padding-inline: 12px;
	background-color: var(--color-main-background);
}

.esw__script-summary {
	display: flex;
	align-items: center;
	min-block-size: 44px;
	font-weight: 700;
	font-size: 0.86rem;
	cursor: pointer;
}

.esw__script-content {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block-start: 8px;
}

.esw__script-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.esw__code-pre {
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

.esw__load-more-wrap {
	display: flex;
	justify-content: center;
	padding-block: 6px;
}
</style>
