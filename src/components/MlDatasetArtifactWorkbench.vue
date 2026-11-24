<template>
	<section
		class="ml-dataset-artifact-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'ML Weights, Quantized Checkpoints and Dataset Shard Auditor')">
		<header class="mldw__toolbar">
			<div class="mldw__title-group">
				<h3 class="mldw__title">
					{{ t('duplicatefinder', 'ML Weights, Quantized Checkpoints & Dataset Shard Auditor') }}
				</h3>
				<span
					class="mldw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} reclaimable / {masters} master-guarded', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						masters: analysis.summary.totalModelMasterClusters,
					}) }}
				</span>
			</div>

			<div class="mldw__toolbar-actions">
				<button
					type="button"
					class="mldw__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="mldw__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="mldw__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="mldw__tool-btn is-close"
					aria-keyshortcuts="Shift+W"
					:title="t('duplicatefinder', 'Hide ML Weights and Dataset Shard Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide ML & Dataset Audit') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="mldw__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="mldw__kpis">
			<div class="mldw__kpi">
				<span class="mldw__kpi-label">{{ t('duplicatefinder', 'Safe Registry Reclaim') }}</span>
				<strong class="mldw__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="mldw__kpi">
				<span class="mldw__kpi-label">{{ t('duplicatefinder', 'Master Weights & Sidecars') }}</span>
				<strong class="mldw__kpi-val is-warn">
					{{ analysis.summary.totalModelMasterClusters }} {{ t('duplicatefinder', 'mastered') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="mldw__kpi">
				<span class="mldw__kpi-label">{{ t('duplicatefinder', 'Quantized & Step Checkpoints') }}</span>
				<strong class="mldw__kpi-val">
					{{ analysis.summary.totalQuantizedVariantClusters }} {{ t('duplicatefinder', 'quantized') }} / {{ analysis.summary.totalStepCheckpointClusters }} {{ t('duplicatefinder', 'steps') }}
				</strong>
			</div>
			<div class="mldw__kpi">
				<span class="mldw__kpi-label">{{ t('duplicatefinder', 'Raw ML & Dataset Footprint') }}</span>
				<strong class="mldw__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="mldw__empty-banner"
			role="note">
			<div class="mldw__empty-text">
				<p class="mldw__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure Model Master and Tokenizer guards before scanning') }}
				</p>
				<p class="mldw__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit model master weights (.safetensors/.bin/.onnx/.pt/.pth), quantized variants (.gguf Q4_K_M/Q5_K_M/Q8_0/F16/.awq/.exl2), training checkpoints (checkpoint-*/step-*/epoch_*/optimizer.pt/scheduler.pt/rng_state.pth), and dataset shards or caches (.parquet/.arrow/.hdf5/.tfrecord/.ipynb_checkpoints/mlruns/wandb/.cache/huggingface).') }}
				</p>
			</div>
			<button
				type="button"
				class="mldw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="mldw__controls">
			<div class="mldw__control-row">
				<span class="mldw__control-label">{{ t('duplicatefinder', 'Audit Preset') }}</span>
				<div
					class="mldw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'ML weights and dataset audit presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="mldw__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="mldw__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="mldw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="mldw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="mldw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="mldw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="mldw__seg-btn"
					:class="{ 'is-active': protectModelMasters }"
					:aria-pressed="protectModelMasters ? 'true' : 'false'"
					@click="protectModelMasters = !protectModelMasters">
					<span>{{ protectModelMasters ? t('duplicatefinder', 'Model Master Guard: ON') : t('duplicatefinder', 'Model Master Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="mldw__seg-btn"
					:class="{ 'is-active': protectSidecarManifests }"
					:aria-pressed="protectSidecarManifests ? 'true' : 'false'"
					@click="protectSidecarManifests = !protectSidecarManifests">
					<span>{{ protectSidecarManifests ? t('duplicatefinder', 'Sidecar & Tokenizer Guard: ON') : t('duplicatefinder', 'Sidecar & Tokenizer Guard: OFF') }}</span>
				</button>
			</div>

			<div class="mldw__control-row mldw__inputs-row">
				<label class="mldw__field">
					<span class="mldw__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="mldw__input">
						<option value="prune-intermediate-step-checkpoints">{{ t('duplicatefinder', 'Prune Intermediate Step Checkpoints') }}</option>
						<option value="consolidate-quantized-model-twins">{{ t('duplicatefinder', 'Consolidate Quantized Model Twins & Shards') }}</option>
						<option value="prune-notebook-and-hub-caches">{{ t('duplicatefinder', 'Prune Notebook, MLflow, W&B & HF Caches') }}</option>
					</select>
				</label>

				<label class="mldw__field">
					<span class="mldw__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="mldw__input">
						<option value="model-master-and-release-first">{{ t('duplicatefinder', 'Release Master & Weights first') }}</option>
						<option value="sidecar-and-tokenizer-first">{{ t('duplicatefinder', 'Tokenizer & SHA256SUMS first') }}</option>
						<option value="quantized-lineage-first">{{ t('duplicatefinder', 'Quantized GGUF/AWQ lineage first') }}</option>
						<option value="newest-checkpoint-first">{{ t('duplicatefinder', 'Newest checkpoint step first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="mldw__field">
					<span class="mldw__field-label">{{ t('duplicatefinder', 'Keep Checkpoints') }}</span>
					<input
						v-model="keepRecentCheckpointsInput"
						type="number"
						min="1"
						step="1"
						class="mldw__input mldw__num-input">
				</label>

				<label class="mldw__field">
					<span class="mldw__field-label">{{ t('duplicatefinder', 'Stale Cache (d)') }}</span>
					<input
						v-model="staleCacheDaysInput"
						type="number"
						min="0"
						step="1"
						class="mldw__input mldw__num-input">
				</label>

				<label class="mldw__field">
					<span class="mldw__field-label">{{ t('duplicatefinder', 'Min Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="mldw__input mldw__num-input">
				</label>

				<label class="mldw__field mldw__field-grow">
					<span class="mldw__field-label">{{ t('duplicatefinder', 'Filter Model Lineage, Quant Tag or Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="mldw__input"
						:placeholder="t('duplicatefinder', 'e.g. safetensors, Q4_K_M, checkpoint-1000, parquet, wandb')">
				</label>

				<label class="mldw__field mldw__field-grow">
					<span class="mldw__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="mldw__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="mldw__field">
					<span class="mldw__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="mldw__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Master & lineage risk') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact name (A-Z)') }}</option>
					</select>
				</label>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty"
			class="mldw__filters-strip">
			<div
				class="mldw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by ML or dataset artifact family')">
				<button
					type="button"
					class="mldw__chip"
					:class="{ 'is-active': familyFilter === 'all' }"
					:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
					@click="familyFilter = 'all'">
					<span>{{ t('duplicatefinder', 'All ML Artifacts ({count})', { count: analysis.summary.familyCounts.all || 0 }) }}</span>
				</button>
				<button
					v-for="familyItem in familyOptions"
					:key="familyItem.id"
					type="button"
					class="mldw__chip"
					:class="{ 'is-active': familyFilter === familyItem.id }"
					:aria-pressed="familyFilter === familyItem.id ? 'true' : 'false'"
					@click="familyFilter = familyItem.id">
					<span>{{ familyItem.label }} ({{ analysis.summary.familyCounts[familyItem.id] || 0 }})</span>
				</button>
			</div>

			<div
				class="mldw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by ML and dataset audit verdict')">
				<button
					v-for="verdictOpt in verdictFilterOptions"
					:key="verdictOpt.id"
					type="button"
					class="mldw__chip"
					:class="{ 'is-active': verdictFilter === verdictOpt.id }"
					:aria-pressed="verdictFilter === verdictOpt.id ? 'true' : 'false'"
					@click="verdictFilter = verdictOpt.id">
					<span>{{ verdictOpt.label }}</span>
				</button>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty && analysis.clusters.length === 0"
			class="mldw__empty-banner"
			role="note">
			<div class="mldw__empty-text">
				<p class="mldw__empty-title">
					{{ t('duplicatefinder', 'No ML model weights, quantized variants, step checkpoints, or dataset shards match the active filters') }}
				</p>
				<p class="mldw__empty-hint">
					{{ t('duplicatefinder', 'Adjust the artifact family filter, lower minimum size, or clear the search query to inspect other duplicate groups.') }}
				</p>
			</div>
			<button
				type="button"
				class="mldw__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset Filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="mldw__workstation">
			<div class="mldw__list-pane">
				<div class="mldw__pane-header">
					<span class="mldw__pane-title">
						{{ t('duplicatefinder', 'Model Lineage & Dataset Clusters ({count})', { count: analysis.clusters.length }) }}
					</span>
				</div>

				<div class="mldw__cluster-list">
					<button
						v-for="cluster in visibleClusters"
						:key="cluster.groupKey"
						type="button"
						class="mldw__cluster-item"
						:class="{ 'is-selected': selectedCluster && selectedCluster.groupKey === cluster.groupKey }"
						@click="selectedClusterKey = cluster.groupKey">
						<div class="mldw__cluster-top">
							<span class="mldw__cluster-name">{{ cluster.displayName }}</span>
							<span
								class="mldw__pill"
								:class="`is-risk-${cluster.clusterRiskState}`">
								{{ formatRiskLabel(cluster.clusterRiskState) }}
							</span>
						</div>
						<div class="mldw__cluster-meta">
							<span>{{ cluster.familyLabel }}</span>
							<span>{{ cluster.modelLineageStem }}</span>
							<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
							<span class="mldw__num-cell">{{ cluster.formattedReclaimableBytes }}</span>
						</div>
						<div
							v-if="cluster.survivor"
							class="mldw__cluster-path">
							{{ cluster.survivor.normalizedPath }}
						</div>
					</button>
				</div>

				<div
					v-if="analysis.clusters.length > visibleLimit"
					class="mldw__load-more-wrap">
					<button
						type="button"
						class="mldw__tool-btn"
						@click="visibleLimit += 25">
						<span>{{ t('duplicatefinder', 'Load more ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="selectedCluster"
				class="mldw__inspector-pane">
				<header class="mldw__inspector-header">
					<div class="mldw__inspector-title-wrap">
						<h4 class="mldw__inspector-title">
							{{ selectedCluster.displayName }}
						</h4>
						<span class="mldw__inspector-sub">
							{{ selectedCluster.familyLabel }} / .{{ selectedCluster.extension || 'dir' }} / {{ selectedCluster.modelLineageStem }}
						</span>
					</div>

					<div class="mldw__inspector-actions">
						<button
							type="button"
							class="mldw__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Focus Group') }}</span>
						</button>
						<button
							type="button"
							class="mldw__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Compare Copies') }}</span>
						</button>
					</div>
				</header>

				<div
					v-if="selectedCluster.clusterRiskState === 'unverified-master'"
					class="mldw__warn-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'Unverified Model Master Guard:') }}</strong>
					{{ t('duplicatefinder', 'Deletion of quantized weights (.gguf/.awq/.exl2) and dataset shards (.parquet/.arrow/.hdf5/.h5/.tfrecord) is strictly blocked whenever no verified model master weight, SHA256SUMS/index sidecar, or conserved size+hash twin exists.') }}
				</div>

				<div
					v-if="selectedCluster.hasModelMaster || selectedCluster.hasSidecarManifest"
					class="mldw__info-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'Model Master & Sidecar Integrity Guard:') }}</strong>
					{{ t('duplicatefinder', 'Release/production master weights (.safetensors/.bin/.onnx/.pt/.pth) and sidecars (config.json, tokenizer.json, model.safetensors.index.json, SHA256SUMS) are strictly protected by default.') }}
				</div>

				<div class="mldw__meta-grid">
					<div class="mldw__meta-item">
						<span class="mldw__meta-label">{{ t('duplicatefinder', 'Model Lineage Stem') }}</span>
						<span>{{ selectedCluster.modelLineageStem }}</span>
					</div>
					<div class="mldw__meta-item">
						<span class="mldw__meta-label">{{ t('duplicatefinder', 'Artifact & Quant Tags') }}</span>
						<span>{{ selectedCluster.artifactSummary }}</span>
					</div>
					<div class="mldw__meta-item">
						<span class="mldw__meta-label">{{ t('duplicatefinder', 'Governance Tiers Present') }}</span>
						<span>{{ selectedCluster.governanceSummary }}</span>
					</div>
					<div class="mldw__meta-item">
						<span class="mldw__meta-label">{{ t('duplicatefinder', 'Canonical Registry Anchor') }}</span>
						<span class="mldw__mono-text">{{ selectedCluster.survivor ? selectedCluster.survivor.normalizedPath : '-' }}</span>
					</div>
					<div class="mldw__meta-item">
						<span class="mldw__meta-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<span class="mldw__num-cell">{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableCopiesCount }} / {{ selectedCluster.copyCount }})</span>
					</div>
				</div>

				<div class="mldw__member-list">
					<article
						v-for="member in selectedCluster.members"
						:key="member.selectionKey"
						class="mldw__member-card"
						:class="`is-verdict-${member.verdict}`">
						<div class="mldw__member-top">
							<span class="mldw__member-name">{{ member.basename }}</span>
							<div class="mldw__member-badges">
								<span
									class="mldw__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdictLabel }}
								</span>
								<span
									class="mldw__pill"
									:class="authorityPillClass(member.context.authorityScore)">
									{{ t('duplicatefinder', 'Authority {score}', { score: member.context.authorityScore }) }}
								</span>
							</div>
						</div>

						<div class="mldw__member-path">
							{{ member.normalizedPath }}
						</div>

						<div class="mldw__member-meta">
							<span>{{ member.tierLabel }}</span>
							<span class="mldw__num-cell">{{ member.formattedSize }}</span>
							<span v-if="member.context.ageDays !== null" class="mldw__num-cell">{{ member.context.ageDays }}d {{ t('duplicatefinder', 'old') }}</span>
							<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
						</div>

						<div class="mldw__companion-chips">
							<span class="mldw__companion-chip">{{ member.context.modelLineageStem }}</span>
							<span
								v-if="member.context.quantTag"
								class="mldw__companion-chip">
								{{ member.context.quantTag }}
							</span>
							<span
								v-if="member.context.stepNumber !== null"
								class="mldw__companion-chip">
								step-{{ member.context.stepNumber }}
							</span>
							<span
								v-if="member.context.artifactTag !== 'none'"
								class="mldw__companion-chip">
								{{ member.context.artifactTag }}
							</span>
							<span
								v-if="member.context.isModelMasterWeight"
								class="mldw__companion-chip is-warn">
								{{ t('duplicatefinder', 'Model Master Weights') }}
							</span>
							<span
								v-if="member.context.isSidecarManifest"
								class="mldw__companion-chip is-warn">
								{{ t('duplicatefinder', 'Sidecar / Tokenizer') }}
							</span>
							<span
								v-if="member.context.isQuantizedVariant || member.context.isDatasetShard"
								class="mldw__companion-chip">
								{{ member.context.hasVerifiedModelMasterTwin ? t('duplicatefinder', 'Master / SHA-256 Twin Verified') : t('duplicatefinder', 'Unverified Master Lineage') }}
							</span>
							<span
								v-if="member.context.isTrainingStepCheckpoint || member.context.isNotebookOrHubCache"
								class="mldw__companion-chip">
								{{ member.context.isStaleArtifact ? t('duplicatefinder', 'Stale Artifact') : t('duplicatefinder', 'Recent Artifact') }}
							</span>
						</div>

						<p class="mldw__member-note">
							{{ member.note }}
						</p>

						<div class="mldw__override-bar">
							<span class="mldw__control-label">{{ t('duplicatefinder', 'Operator Override:') }}</span>
							<button
								type="button"
								class="mldw__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'auto' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'auto' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'auto')">
								<span>{{ t('duplicatefinder', 'Auto') }}</span>
							</button>
							<button
								type="button"
								class="mldw__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'force-keep' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'force-keep' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'force-keep')">
								<span>{{ t('duplicatefinder', 'Shield Copy') }}</span>
							</button>
							<button
								type="button"
								class="mldw__seg-btn"
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
			class="mldw__script-box">
			<summary class="mldw__script-summary">
				{{ t('duplicatefinder', 'POSIX DRY_RUN=1 Script (sha256sum -- + stat cross-device + occ files:scan) & .sync-exclude.lst') }}
			</summary>
			<div class="mldw__script-content">
				<div class="mldw__script-actions">
					<button
						type="button"
						class="mldw__tool-btn"
						@click="copyRemediationScript">
						<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
					</button>
					<button
						type="button"
						class="mldw__tool-btn"
						@click="copySyncExcludeSnippet">
						<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
					</button>
				</div>
				<pre class="mldw__code-pre"><code>{{ generatedScript }}</code></pre>
				<pre class="mldw__code-pre"><code>{{ generatedSyncExclude }}</code></pre>
			</div>
		</details>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	ML_DATASET_ARTIFACT_FAMILY_META,
	ML_DATASET_ARTIFACT_PRESETS,
	analyzeMlDatasetArtifactDuplicates,
	buildMlDatasetArtifactCsvReport,
	buildMlDatasetArtifactJsonReport,
	buildMlDatasetArtifactScript,
	buildMlDatasetArtifactSyncExcludeSnippet,
} from '../tools/mlDatasetArtifactAuditor'

export default {
	name: 'MlDatasetArtifactWorkbench',
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
			presetId: 'all-ml-dataset-artifact-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'consolidate-quantized-model-twins',
			survivorRule: 'model-master-and-release-first',
			protectModelMasters: true,
			protectSidecarManifests: true,
			keepRecentCheckpointsInput: '2',
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
			return ML_DATASET_ARTIFACT_PRESETS
		},
		familyOptions() {
			return Object.values(ML_DATASET_ARTIFACT_FAMILY_META)
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable / Consolidatable') },
				{ id: 'model-master', label: this.t('duplicatefinder', 'Model Master Weights') },
				{ id: 'sidecar-manifest', label: this.t('duplicatefinder', 'Sidecars & Tokenizers') },
				{ id: 'quantized-variant', label: this.t('duplicatefinder', 'Quantized Variants') },
				{ id: 'step-checkpoint', label: this.t('duplicatefinder', 'Step Checkpoints') },
				{ id: 'dataset-shard-cache', label: this.t('duplicatefinder', 'Dataset Shards & Caches') },
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
		parsedKeepRecentCheckpoints() {
			const trimmed = String(this.keepRecentCheckpointsInput ?? '').trim()
			if (!trimmed) {
				return 2
			}
			const parsed = Number.parseInt(trimmed, 10)
			return Number.isFinite(parsed) && parsed >= 1 ? parsed : 2
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
			return analyzeMlDatasetArtifactDuplicates(this.activePool, {
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectModelMasters: this.protectModelMasters,
				protectSidecarManifests: this.protectSidecarManifests,
				keepRecentCheckpoints: this.parsedKeepRecentCheckpoints,
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
			return buildMlDatasetArtifactScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
		generatedSyncExclude() {
			return buildMlDatasetArtifactSyncExcludeSnippet(this.analysis)
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
			const preset = ML_DATASET_ARTIFACT_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectModelMasters = preset.protectModelMasters
			this.protectSidecarManifests = preset.protectSidecarManifests
			this.keepRecentCheckpointsInput = String(preset.keepRecentCheckpoints)
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
				'model-master': this.t('duplicatefinder', 'Master Protected'),
				'sidecar-manifest': this.t('duplicatefinder', 'Sidecar Protected'),
				'unverified-master': this.t('duplicatefinder', 'Unverified Master'),
				'master-verified': this.t('duplicatefinder', 'Master Verified'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		verdictPillClass(verdict) {
			if (verdict === 'keep-canonical-survivor') {
				return 'is-keep'
			}
			if (
				verdict === 'blocked-model-master-weights'
				|| verdict === 'blocked-sidecar-manifest'
			) {
				return 'is-danger'
			}
			if (
				verdict === 'blocked-unverified-model-master'
				|| verdict === 'blocked-recent-step-checkpoint'
				|| verdict === 'blocked-fresh-notebook-cache'
				|| verdict === 'blocked-not-step-checkpoint'
				|| verdict === 'blocked-not-notebook-cache'
				|| verdict === 'blocked-manual-shield'
				|| verdict === 'excluded'
			) {
				return 'is-warn'
			}
			if (verdict === 'consolidate-to-model-master') {
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
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 ML Weights & Dataset Audit remediation script to clipboard.'))
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
			const csv = buildMlDatasetArtifactCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-ml-dataset-artifact-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe ML Weights & Dataset CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildMlDatasetArtifactJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-ml-dataset-artifact-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported ML Weights & Dataset JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.ml-dataset-artifact-workbench {
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
}

.mldw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.mldw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.mldw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.mldw__status-badge {
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
	font-variant-numeric: tabular-nums;
	color: var(--color-text-maxcontrast);
	max-inline-size: 100%;
	overflow-wrap: anywhere;
}

.mldw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.mldw__tool-btn,
.mldw__seg-btn,
.mldw__chip,
.mldw__primary-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-block-size: 44px;
	min-inline-size: 44px;
	padding-block: 11px;
	padding-inline: 14px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.85rem;
	font-weight: 600;
	line-height: 1.4;
	cursor: pointer;
	box-sizing: border-box;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.mldw__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, #ffffff);
}

.mldw__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.mldw__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element, #0082c9);
}

.mldw__seg-btn.is-active,
.mldw__chip.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.mldw__tool-btn:focus-visible,
.mldw__seg-btn:focus-visible,
.mldw__chip:focus-visible,
.mldw__primary-btn:focus-visible,
.mldw__cluster-item:focus-visible,
.mldw__input:focus-visible,
.mldw__script-summary:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.mldw__notice {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	font-size: 0.86rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.mldw__notice.is-success {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.mldw__notice.is-error {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.mldw__empty-banner {
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

.mldw__empty-text {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 68ch;
}

.mldw__empty-title {
	margin: 0;
	font-weight: 700;
	font-size: 0.94rem;
}

.mldw__empty-hint {
	margin: 0;
	font-size: 0.85rem;
	color: var(--color-text-maxcontrast);
	line-height: 1.45;
}

.mldw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.mldw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.mldw__control-label {
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.mldw__segments,
.mldw__chip-group,
.mldw__filters-strip {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.mldw__filters-strip {
	flex-direction: column;
	gap: 8px;
}

.mldw__inputs-row {
	align-items: flex-end;
}

.mldw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.mldw__field-grow {
	flex: 1 1 200px;
}

.mldw__field-label {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.mldw__input {
	min-block-size: 44px;
	padding-block: 10px;
	padding-inline: 10px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.86rem;
	line-height: 1.4;
	box-sizing: border-box;
	inline-size: 100%;
	min-inline-size: 0;
}

.mldw__num-input {
	inline-size: 108px;
	max-inline-size: 100%;
	font-variant-numeric: tabular-nums;
}

.mldw__num-cell {
	font-variant-numeric: tabular-nums;
}

.mldw__kpis {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 8px;
}

@media (min-width: 560px) {
	.mldw__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (min-width: 980px) {
	.mldw__kpis {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
}

.mldw__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding-block: 8px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-inline-start: 3px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.mldw__kpi-label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.03em;
	color: var(--color-text-maxcontrast);
}

.mldw__kpi-val {
	font-size: 0.98rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	overflow-wrap: anywhere;
}

.mldw__kpi-val.is-accent {
	color: #0b4a8b;
}

.mldw__kpi-val.is-warn {
	color: #7c4a03;
}

.mldw__workstation {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 12px;
}

@media (min-width: 1080px) {
	.mldw__workstation {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
		align-items: start;
	}
}

.mldw__list-pane,
.mldw__inspector-pane {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.mldw__pane-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding-block-end: 6px;
	border-block-end: 1px solid var(--color-border);
}

.mldw__pane-title {
	font-size: 0.86rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.02em;
}

.mldw__cluster-list,
.mldw__member-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.mldw__cluster-item {
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

.mldw__cluster-item.is-selected {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light);
}

.mldw__cluster-top,
.mldw__member-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.mldw__cluster-name,
.mldw__member-name {
	font-weight: 700;
	font-size: 0.9rem;
	overflow-wrap: anywhere;
}

.mldw__cluster-path,
.mldw__member-path {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.mldw__cluster-meta,
.mldw__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.mldw__pill {
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.72rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.mldw__pill.is-danger {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.mldw__pill.is-risk-model-master,
.mldw__pill.is-risk-unverified-master,
.mldw__pill.is-risk-shielded,
.mldw__pill.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.mldw__pill.is-risk-sidecar-manifest,
.mldw__pill.is-risk-master-verified,
.mldw__pill.is-consolidate {
	background-color: #e8f1fb;
	color: #0b4a8b;
	border-color: #9ec5fe;
}

.mldw__pill.is-risk-reclaimable,
.mldw__pill.is-reclaim,
.mldw__pill.is-keep {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.mldw__inspector-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.mldw__inspector-title-wrap {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
}

.mldw__inspector-title {
	margin: 0;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.mldw__inspector-sub {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.mldw__inspector-actions,
.mldw__override-bar,
.mldw__member-badges,
.mldw__companion-chips {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.mldw__companion-chip {
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

.mldw__companion-chip.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.mldw__warn-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #f5c97b;
	background-color: #fff4e5;
	color: #7c4a03;
	font-size: 0.83rem;
	line-height: 1.45;
}

.mldw__info-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #9ec5fe;
	background-color: #e8f1fb;
	color: #0b4a8b;
	font-size: 0.83rem;
	line-height: 1.45;
}

.mldw__meta-grid {
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
	.mldw__meta-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

.mldw__meta-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.84rem;
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.mldw__meta-label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.mldw__mono-text {
	font-family: monospace;
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}

.mldw__member-card {
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

.mldw__member-card.is-verdict-keep-canonical-survivor,
.mldw__member-card.is-verdict-reclaim-step-checkpoint,
.mldw__member-card.is-verdict-reclaim-notebook-hub-cache {
	border-inline-start: 4px solid #0f5132;
}

.mldw__member-card.is-verdict-consolidate-to-model-master {
	border-inline-start: 4px solid #0b4a8b;
}

.mldw__member-card.is-verdict-blocked-model-master-weights,
.mldw__member-card.is-verdict-blocked-sidecar-manifest {
	border-inline-start: 4px solid #842029;
}

.mldw__member-card.is-verdict-blocked-unverified-model-master,
.mldw__member-card.is-verdict-blocked-recent-step-checkpoint,
.mldw__member-card.is-verdict-blocked-fresh-notebook-cache,
.mldw__member-card.is-verdict-blocked-not-step-checkpoint,
.mldw__member-card.is-verdict-blocked-not-notebook-cache,
.mldw__member-card.is-verdict-blocked-manual-shield,
.mldw__member-card.is-verdict-excluded {
	border-inline-start: 4px solid #7c4a03;
}

.mldw__member-note {
	margin: 0;
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 68ch;
}

.mldw__script-box {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	padding-block: 8px;
	padding-inline: 12px;
	background-color: var(--color-main-background);
}

.mldw__script-summary {
	display: flex;
	align-items: center;
	min-block-size: 44px;
	padding-block: 6px;
	font-weight: 700;
	font-size: 0.86rem;
	line-height: 1.4;
	cursor: pointer;
}

.mldw__script-content {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block-start: 8px;
}

.mldw__script-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.mldw__code-pre {
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

.mldw__load-more-wrap {
	display: flex;
	justify-content: center;
	padding-block: 6px;
}
</style>
