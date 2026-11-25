<template>
	<section
		class="speech-asr-bioacoustics-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Speech, Bioacoustics and Multilingual ASR Alignment Vault Auditor')">
		<header class="sab__toolbar">
			<div class="sab__title-group">
				<h3 class="sab__title">
					{{ t('duplicatefinder', 'Speech, Bioacoustics & ASR Alignment Vault Auditor') }}
				</h3>
				<span
					class="sab__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {lex} lexicon-lm, {masters} audio-align, {hold} ethics-hold, {exports} spec-export, {scratch} asr-scratch', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						lex: analysis.summary.totalLexiconIndexClusters,
						masters: analysis.summary.totalAudioAlignmentClusters,
						hold: analysis.summary.totalEthicsHoldClusters,
						exports: analysis.summary.totalRedundantExportClusters,
						scratch: analysis.summary.totalFeatureScratchClusters,
					}) }}
				</span>
			</div>

			<div class="sab__toolbar-actions">
				<button
					type="button"
					class="sab__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="sab__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="sab__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="sab__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="sab__tool-btn is-close"
					aria-keyshortcuts="Alt+Shift+S"
					:title="t('duplicatefinder', 'Hide Speech, Bioacoustics and Multilingual ASR Alignment Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Speech & ASR') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="sab__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="sab__kpis">
			<div class="sab__kpi">
				<span class="sab__kpi-label">{{ t('duplicatefinder', 'Safe Export & Scratch Reclaim') }}</span>
				<strong class="sab__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="sab__kpi">
				<span class="sab__kpi-label">{{ t('duplicatefinder', 'Conserved Lexicons, Masters & Holds') }}</span>
				<strong class="sab__kpi-val is-warn">
					{{ analysis.summary.totalLexiconIndexClusters }} {{ t('duplicatefinder', 'lexicon/lm') }} / {{ analysis.summary.totalAudioAlignmentClusters }} {{ t('duplicatefinder', 'audio/align') }} / {{ analysis.summary.totalEthicsHoldClusters }} {{ t('duplicatefinder', 'ethics-hold') }}
				</strong>
			</div>
			<div class="sab__kpi">
				<span class="sab__kpi-label">{{ t('duplicatefinder', 'Redundant Spectrograms & ASR Scratch') }}</span>
				<strong class="sab__kpi-val is-danger">
					{{ analysis.summary.totalRedundantExportClusters }} {{ t('duplicatefinder', 'spec/srt') }} / {{ analysis.summary.totalFeatureScratchClusters }} {{ t('duplicatefinder', 'scratch') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="sab__kpi">
				<span class="sab__kpi-label">{{ t('duplicatefinder', 'Speech & ASR Duplicate Footprint') }}</span>
				<strong class="sab__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="sab__empty-banner"
			role="note">
			<div class="sab__empty-text">
				<p class="sab__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure Lexicon/LM, Audio/Alignment, and LDC/IRB Hold shields before scanning') }}
				</p>
				<p class="sab__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit LDC/ELRA/IRB voice holds, pronunciation lexicons, FLAC/WAV/GUANO/TextGrid/RTTM masters, spectrogram/transcript exports, and Kaldi/MFA scratch.') }}
				</p>
			</div>
			<button
				type="button"
				class="sab__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="sab__controls">
			<div class="sab__control-row">
				<span class="sab__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="sab__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Speech, bioacoustics and ASR vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="sab__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="sab__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="sab__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="sab__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="sab__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="sab__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="sab__seg-btn"
					:class="{ 'is-active': protectLexiconsAndHolds }"
					:aria-pressed="protectLexiconsAndHolds ? 'true' : 'false'"
					@click="protectLexiconsAndHolds = !protectLexiconsAndHolds">
					<span>{{ protectLexiconsAndHolds ? t('duplicatefinder', 'Shield Lexicons / ARPA / Kaldi: ON') : t('duplicatefinder', 'Shield Lexicons / ARPA / Kaldi: OFF') }}</span>
				</button>

				<button
					type="button"
					class="sab__seg-btn"
					:class="{ 'is-active': protectAudioAndAlignmentMasters }"
					:aria-pressed="protectAudioAndAlignmentMasters ? 'true' : 'false'"
					@click="protectAudioAndAlignmentMasters = !protectAudioAndAlignmentMasters">
					<span>{{ protectAudioAndAlignmentMasters ? t('duplicatefinder', 'Shield FLAC / TextGrid / GUANO: ON') : t('duplicatefinder', 'Shield FLAC / TextGrid / GUANO: OFF') }}</span>
				</button>

				<button
					type="button"
					class="sab__seg-btn"
					:class="{ 'is-active': protectEthicsAndConsentHolds }"
					:aria-pressed="protectEthicsAndConsentHolds ? 'true' : 'false'"
					@click="protectEthicsAndConsentHolds = !protectEthicsAndConsentHolds">
					<span>{{ protectEthicsAndConsentHolds ? t('duplicatefinder', 'Shield LDC / IRB Holds: ON') : t('duplicatefinder', 'Shield LDC / IRB Holds: OFF') }}</span>
				</button>

				<button
					type="button"
					class="sab__seg-btn"
					:class="{ 'is-active': requireSpeechAnchorForPrune }"
					:aria-pressed="requireSpeechAnchorForPrune ? 'true' : 'false'"
					@click="requireSpeechAnchorForPrune = !requireSpeechAnchorForPrune">
					<span>{{ requireSpeechAnchorForPrune ? t('duplicatefinder', 'Require Audio / TextGrid Anchor: ON') : t('duplicatefinder', 'Require Audio / TextGrid Anchor: OFF') }}</span>
				</button>
			</div>

			<div class="sab__control-row sab__inputs-row">
				<label class="sab__field">
					<span class="sab__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="sab__input">
						<option value="prune-exports-and-feature-scratch">{{ t('duplicatefinder', 'Prune Spectrograms & ASR Scratch') }}</option>
						<option value="hardlink-immutable-flac-and-webdataset">{{ t('duplicatefinder', 'Hardlink Immutable FLAC/GUANO/WDS (Block Mutable)') }}</option>
						<option value="quarantine-exports-and-feature-scratch">{{ t('duplicatefinder', 'Quarantine Spectrograms & ASR Scratch') }}</option>
					</select>
				</label>

				<label class="sab__field">
					<span class="sab__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="sab__input">
						<option value="speech-lexicon-master-first">{{ t('duplicatefinder', 'Lexicons & Audio/Alignment first') }}</option>
						<option value="oldest-recording-first">{{ t('duplicatefinder', 'Oldest acoustic capture first') }}</option>
						<option value="newest-alignment-pass-first">{{ t('duplicatefinder', 'Newest forced-alignment pass first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical vault path') }}</option>
					</select>
				</label>

				<label class="sab__field">
					<span class="sab__field-label">{{ t('duplicatefinder', 'ASR Run Grace (d)') }}</span>
					<input
						v-model="keepRecentRunDaysInput"
						type="number"
						min="0"
						step="1"
						class="sab__input sab__num-input">
				</label>

				<label class="sab__field">
					<span class="sab__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="sab__input sab__num-input">
				</label>

				<label class="sab__field sab__field-grow">
					<span class="sab__field-label">{{ t('duplicatefinder', 'Filter FLAC, TextGrid, RTTM, GUANO, Lexicon or Scratch') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="sab__input"
						:placeholder="t('duplicatefinder', 'e.g. textgrid, rttm, flac, guano, arpa, kaldi_tmp, mfa_scratch')">
				</label>

				<label class="sab__field">
					<span class="sab__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="sab__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Export & scratch priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="sab__control-row">
				<span class="sab__control-label">{{ t('duplicatefinder', 'Vault Family') }}</span>
				<div
					class="sab__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Speech and bioacoustics artifact family filter')">
					<button
						type="button"
						class="sab__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="sab__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="sab__control-row">
				<span class="sab__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="sab__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Speech and ASR governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="sab__seg-btn"
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
			class="sab__empty-filter"
			role="note">
			<p class="sab__empty-title">
				{{ t('duplicatefinder', 'No LDC/ELRA holds, pronunciation lexicons, FLAC/TextGrid/GUANO masters, spectrogram/transcript exports, or Kaldi/MFA scratch match the active filters.') }}
			</p>
			<button
				type="button"
				class="sab__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="sab__workspace">
			<div
				class="sab__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Speech, Bioacoustics and ASR Alignment vault clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="sab__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="sab__cluster-top">
						<strong class="sab__cluster-name">{{ cluster.name }}</strong>
						<span
							class="sab__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="sab__cluster-meta">
						<span
							v-if="cluster.speechToolchain"
							class="sab__tag">{{ cluster.speechToolchain }}</span>
						<span
							v-if="cluster.workflowStage"
							class="sab__tag">{{ cluster.workflowStage }}</span>
						<span class="sab__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="sab__cluster-badges">
						<span
							v-if="cluster.hasRedundantSpeechExport"
							class="sab__badge is-redundant">
							{{ cluster.hasSpeechMasterAnchor
								? t('duplicatefinder', 'Redundant Export (Master Anchor Exists)')
								: t('duplicatefinder', 'Unanchored Export (No Master Anchor)') }}
						</span>
						<span
							v-if="cluster.hasProtectedEthicsHold"
							class="sab__badge is-keep">
							{{ t('duplicatefinder', 'LDC / IRB Hold Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedLexiconHold"
							class="sab__badge is-keep">
							{{ t('duplicatefinder', 'Lexicon / ARPA Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedAudioAlignmentMaster"
							class="sab__badge is-consolidate">
							{{ t('duplicatefinder', 'Audio / Alignment Conserved') }}
						</span>
						<span
							v-if="cluster.hasAsrFeatureScratch"
							class="sab__badge is-warn">
							{{ t('duplicatefinder', 'Kaldi / MFA Scratch') }}
						</span>
					</div>
					<div class="sab__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="sab__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="sab__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="sab__inspector">
				<header class="sab__inspector-head">
					<div class="sab__inspector-title-wrap">
						<h4 class="sab__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="sab__inspector-sub">
							{{ selectedCluster.speechToolchain || selectedCluster.sessionStem }} | {{ selectedCluster.workflowStage || selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="sab__inspector-actions">
						<button
							type="button"
							class="sab__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="sab__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="sab__lineage-grid">
					<div class="sab__lineage-item">
						<span class="sab__lineage-label">{{ t('duplicatefinder', 'Session Stem & ASR Toolchain') }}</span>
						<strong class="sab__lineage-val">{{ selectedCluster.speechToolchain ? `${selectedCluster.speechToolchain} / ` : '' }}{{ selectedCluster.sessionStem }} ({{ selectedCluster.speechAnchorKey }})</strong>
					</div>
					<div class="sab__lineage-item">
						<span class="sab__lineage-label">{{ t('duplicatefinder', 'Corpus, Alignment & Hold Governance') }}</span>
						<strong class="sab__lineage-val">
							{{ selectedCluster.hasProtectedEthicsHold ? t('duplicatefinder', 'LDC, ELRA, IRB Consent or Blind-Eval Hold Shielded') : (selectedCluster.hasProtectedLexiconHold ? t('duplicatefinder', 'Pronunciation Lexicon, ARPA LM or Kaldi Index Shielded') : (selectedCluster.hasProtectedAudioAlignmentMaster ? t('duplicatefinder', 'FLAC/WAV/GUANO Audio, WebDataset or TextGrid/RTTM Master Shielded') : t('duplicatefinder', 'Kaldi/MFA Feature Scratch or Derived Spectrogram/Transcript Export'))) }}
						</strong>
					</div>
					<div class="sab__lineage-item">
						<span class="sab__lineage-label">{{ t('duplicatefinder', 'Audio / TextGrid / Lexicon Anchor') }}</span>
						<strong class="sab__lineage-val">
							{{ selectedCluster.hasSpeechMasterAnchor ? t('duplicatefinder', 'Verified FLAC, WAV, TextGrid, RTTM, GUANO or Lexicon Anchor Found') : t('duplicatefinder', 'No Speech or Bioacoustics Anchor Detected') }}
						</strong>
					</div>
					<div class="sab__lineage-item">
						<span class="sab__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="sab__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="sab__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="sab__member-card">
						<div class="sab__member-top">
							<code class="sab__member-path">{{ member.normalized }}</code>
							<div class="sab__member-pills">
								<span
									v-if="member.isRedundantSpeechExportMember"
									class="sab__pill is-redundant">
									{{ t('duplicatefinder', 'REDUNDANT EXPORT (MASTER EXISTS)') }}
								</span>
								<span
									v-if="member.isScratchPath"
									class="sab__pill is-warn">
									{{ t('duplicatefinder', 'ASR / FEATURE SCRATCH') }}
								</span>
								<span
									class="sab__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.speechTag"
									class="sab__pill is-consolidate">
									{{ member.speechTag }}
								</span>
								<span
									class="sab__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="sab__member-bottom">
							<div class="sab__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.vaultRole }}</span>
								<span v-if="member.redundancyReason">{{ member.redundancyReason }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="sab__member-actions">
								<button
									type="button"
									class="sab__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="(!member.isSurvivor || member.isRedundantSpeechExportMember) && !(member.isProtectedEthicsHold && protectEthicsAndConsentHolds) && !(member.isProtectedLexiconHold && protectLexiconsAndHolds) && !(member.isProtectedAudioAlignmentMaster && protectAudioAndAlignmentMasters)"
									class="sab__override-field">
									<span class="sab__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="sab__override-select"
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

				<div class="sab__code-panels">
					<div class="sab__code-box">
						<div class="sab__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="sab__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="sab__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="sab__code-box">
						<div class="sab__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="sab__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="sab__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	SPEECH_ASR_BIOACOUSTICS_PRESETS,
	auditSpeechAsrVault,
	buildSpeechAsrCsvReport,
	buildSpeechAsrJsonManifest,
	buildSpeechAsrRemediationScript,
	buildSpeechAsrSyncExcludeList,
} from '../tools/speechAsrBioacousticsVaultAuditor'

export default {
	name: 'SpeechAsrBioacousticsVaultWorkbench',
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
			presetId: 'all-speech-asr-bioacoustics-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-exports-and-feature-scratch',
			survivorRule: 'speech-lexicon-master-first',
			protectLexiconsAndHolds: true,
			protectAudioAndAlignmentMasters: true,
			protectEthicsAndConsentHolds: true,
			requireSpeechAnchorForPrune: true,
			keepRecentRunDaysInput: '0',
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
			return SPEECH_ASR_BIOACOUSTICS_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'speech-export-redundant', label: this.t('duplicatefinder', 'Spectrograms / SRT') },
				{ id: 'asr-feature-scratch', label: this.t('duplicatefinder', 'Kaldi / MFA Scratch') },
				{ id: 'speech-lexicon-index-protected', label: this.t('duplicatefinder', 'Lexicon / ARPA') },
				{ id: 'audio-alignment-master-protected', label: this.t('duplicatefinder', 'Audio / TextGrid') },
				{ id: 'ethics-consent-hold-protected', label: this.t('duplicatefinder', 'LDC / IRB Hold') },
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
		parsedKeepRecentRunDays() {
			const trimmed = String(this.keepRecentRunDaysInput ?? '').trim()
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
			return auditSpeechAsrVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectLexiconsAndHolds: this.protectLexiconsAndHolds,
				protectAudioAndAlignmentMasters: this.protectAudioAndAlignmentMasters,
				protectEthicsAndConsentHolds: this.protectEthicsAndConsentHolds,
				requireSpeechAnchorForPrune: this.requireSpeechAnchorForPrune,
				keepRecentRunDays: this.parsedKeepRecentRunDays,
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
			return buildSpeechAsrRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildSpeechAsrSyncExcludeList()
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
			const preset = SPEECH_ASR_BIOACOUSTICS_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectLexiconsAndHolds = preset.protectLexiconsAndHolds
			this.protectAudioAndAlignmentMasters = preset.protectAudioAndAlignmentMasters
			this.protectEthicsAndConsentHolds = preset.protectEthicsAndConsentHolds
			this.requireSpeechAnchorForPrune = preset.requireSpeechAnchorForPrune
			this.keepRecentRunDaysInput = String(preset.keepRecentRunDays)
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
				'speech-lexicon-index-protected': this.t('duplicatefinder', 'Lexicon / ARPA'),
				'audio-alignment-master-protected': this.t('duplicatefinder', 'Audio / TextGrid'),
				'ethics-consent-hold-protected': this.t('duplicatefinder', 'LDC / IRB Hold'),
				'speech-export-redundant': this.t('duplicatefinder', 'Redundant Export'),
				'asr-feature-scratch': this.t('duplicatefinder', 'ASR Scratch'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'speech-export-redundant') {
				return 'is-redundant'
			}
			if (verdict === 'speech-lexicon-index-protected' || verdict === 'ethics-consent-hold-protected') {
				return 'is-keep'
			}
			if (verdict === 'audio-alignment-master-protected') {
				return 'is-consolidate'
			}
			if (verdict === 'asr-feature-scratch') {
				return 'is-reclaim'
			}
			return 'is-warn'
		},
		actionPillClass(member) {
			if (member.action === 'delete') {
				return member.isRedundantSpeechExportMember ? 'is-redundant' : 'is-reclaim'
			}
			if (member.action === 'hardlink') {
				return 'is-consolidate'
			}
			return member.shielded ? 'is-keep' : 'is-warn'
		},
		formatMemberActionLabel(member) {
			if (member.action === 'delete') {
				return (this.strategy === 'quarantine-exports-and-feature-scratch' && (member.isRedundantSpeechExport || member.isScratchPath))
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
			return cluster.sourceGroup
				|| cluster.group
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
				this.setNotice(this.t('duplicatefinder', 'Copied Speech or Bioacoustics vault file path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Speech & ASR remediation script to clipboard.'))
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
			const csv = buildSpeechAsrCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-speech-asr-bioacoustics-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Speech & ASR Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildSpeechAsrJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-speech-asr-bioacoustics-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Speech & ASR Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.speech-asr-bioacoustics-vault-workbench {
	container-type: inline-size;
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

.sab__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
	min-inline-size: 0;
}

.sab__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.sab__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.sab__status-badge {
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

.sab__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.sab__tool-btn,
.sab__seg-btn,
.sab__primary-btn,
.sab__load-more-btn,
.sab__mini-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-block-size: 44px;
	min-inline-size: 44px;
	padding-block: 8px;
	padding-inline: 12px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: 6px;
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.84rem;
	font-weight: 600;
	cursor: pointer;
	box-sizing: border-box;
	max-inline-size: 100%;
	text-align: center;
	overflow-wrap: anywhere;
}

.sab__tool-btn.is-primary-outline,
.sab__primary-btn {
	border-color: var(--color-primary-element);
}

.sab__primary-btn {
	background-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #ffffff);
}

.sab__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.sab__tool-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.sab__tool-btn:focus-visible,
.sab__seg-btn:focus-visible,
.sab__primary-btn:focus-visible,
.sab__load-more-btn:focus-visible,
.sab__mini-btn:focus-visible,
.sab__cluster-card:focus-visible,
.sab__input:focus-visible,
.sab__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.sab__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	overflow-wrap: anywhere;
}

.sab__notice.is-error {
	border-color: var(--color-error, #b91c1c);
}

.sab__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.sab__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.sab__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.sab__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.sab__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.sab__kpi-val.is-warn {
	color: var(--color-warning, #b45309);
}

.sab__kpi-val.is-danger {
	color: var(--color-error, #b91c1c);
}

.sab__empty-banner,
.sab__empty-filter {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 12px 14px;
	border: 1px dashed var(--color-border-dark, var(--color-border));
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.sab__empty-text {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.sab__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
	overflow-wrap: anywhere;
}

.sab__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.sab__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.sab__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.sab__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 92px;
}

.sab__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.sab__inputs-row {
	align-items: flex-end;
}

.sab__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.sab__field-grow {
	flex: 1 1 220px;
}

.sab__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.sab__input,
.sab__override-select {
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
	min-inline-size: 0;
}

.sab__num-input {
	inline-size: 96px;
}

.sab__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.sab__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.sab__cluster-card {
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

.sab__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.sab__cluster-top,
.sab__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
	min-inline-size: 0;
}

.sab__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.sab__cluster-meta,
.sab__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
	min-inline-size: 0;
}

.sab__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
	max-inline-size: 100%;
	overflow-wrap: anywhere;
}

.sab__badge,
.sab__pill {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 7px;
	border-radius: 999px;
	font-size: 0.74rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	max-inline-size: 100%;
	overflow-wrap: anywhere;
}

.sab__pill.is-keep,
.sab__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.sab__pill.is-redundant,
.sab__badge.is-redundant {
	border-color: var(--color-error, #b91c1c);
	color: var(--color-error, #b91c1c);
}

.sab__pill.is-consolidate,
.sab__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.sab__pill.is-warn,
.sab__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.sab__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.sab__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.sab__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.sab__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
	min-inline-size: 0;
}

.sab__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 200px;
}

.sab__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.sab__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.sab__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	min-inline-size: 0;
}

.sab__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
	min-inline-size: 0;
}

.sab__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.sab__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.sab__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.sab__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.sab__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.sab__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.sab__member-top,
.sab__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	min-inline-size: 0;
}

.sab__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.sab__member-pills,
.sab__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.sab__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.sab__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.sab__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.sab__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
	min-inline-size: 0;
}

.sab__pre {
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

.sab__sr-only {
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

@container (max-width: 1020px) {
	.sab__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.sab__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.sab__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@container (max-width: 560px) {
	.sab__kpis,
	.sab__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.sab__num-input {
		inline-size: 100%;
	}

	.sab__field {
		flex: 1 1 100%;
	}
}

@media (max-width: 1120px) {
	.sab__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.sab__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.sab__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.speech-asr-bioacoustics-vault-workbench {
		padding: 10px;
	}

	.sab__kpis,
	.sab__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.sab__num-input {
		inline-size: 100%;
	}

	.sab__field {
		flex: 1 1 100%;
	}
}
</style>
