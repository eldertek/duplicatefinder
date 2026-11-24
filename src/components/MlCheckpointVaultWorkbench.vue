<template>
	<section
		class="ml-checkpoint-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Machine Learning, LLM Weights and Dataset Checkpoint Vault Auditor')">
		<header class="mcvw__toolbar">
			<div class="mcvw__title-group">
				<h3 class="mcvw__title">
					{{ t('duplicatefinder', 'Machine Learning, LLM Weights & Dataset Checkpoint Vault Auditor') }}
				</h3>
				<span
					class="mcvw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {best} best-final, {gguf} GGUF, {steps} step-* vs {caches} caches', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						best: analysis.summary.totalBestFinalClusters,
						gguf: analysis.summary.totalGgufQuantClusters,
						steps: analysis.summary.totalStepCheckpointClusters,
						caches: analysis.summary.totalRegenerableCacheClusters,
					}) }}
				</span>
			</div>

			<div class="mcvw__toolbar-actions">
				<button
					type="button"
					class="mcvw__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="mcvw__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="mcvw__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="mcvw__tool-btn is-close"
					aria-keyshortcuts="F2"
					:title="t('duplicatefinder', 'Hide Machine Learning, LLM Weights and Dataset Checkpoint Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide ML Checkpoint Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="mcvw__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="mcvw__kpis">
			<div class="mcvw__kpi">
				<span class="mcvw__kpi-label">{{ t('duplicatefinder', 'Safe Vault Reclaim') }}</span>
				<strong class="mcvw__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="mcvw__kpi">
				<span class="mcvw__kpi-label">{{ t('duplicatefinder', 'Best/Final & Tokenizer/Config') }}</span>
				<strong class="mcvw__kpi-val is-warn">
					{{ analysis.summary.totalBestFinalClusters }} {{ t('duplicatefinder', 'best/final') }} / {{ analysis.summary.totalTokenizerConfigClusters }} {{ t('duplicatefinder', 'configs') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="mcvw__kpi">
				<span class="mcvw__kpi-label">{{ t('duplicatefinder', 'GGUF, step-*, Datasets & Caches') }}</span>
				<strong class="mcvw__kpi-val">
					{{ analysis.summary.totalGgufQuantClusters }} {{ t('duplicatefinder', 'GGUF') }} / {{ analysis.summary.totalStepCheckpointClusters }} {{ t('duplicatefinder', 'step-*') }} / {{ analysis.summary.totalDatasetClusters }} {{ t('duplicatefinder', 'datasets') }} / {{ analysis.summary.totalRegenerableCacheClusters }} {{ t('duplicatefinder', 'caches') }}
				</strong>
			</div>
			<div class="mcvw__kpi">
				<span class="mcvw__kpi-label">{{ t('duplicatefinder', 'Raw ML Vault Footprint') }}</span>
				<strong class="mcvw__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="mcvw__empty-banner"
			role="note">
			<div class="mcvw__empty-text">
				<p class="mcvw__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure best/final weights and tokenizer/config shields before scanning') }}
				</p>
				<p class="mcvw__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit model weights (.safetensors, .gguf, .ckpt, .pt, .pth, .onnx, .bin), datasets (.parquet, .arrow, .jsonl, .tfrecord), regenerable caches (__pycache__/, .cache/huggingface/, wandb/, lightning_logs/), intermediate checkpoints/step-* vs best/final, and GGUF Q4_K_M/Q8_0 quantizations derived from FP16 safetensors.') }}
				</p>
			</div>
			<button
				type="button"
				class="mcvw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="mcvw__controls">
			<div class="mcvw__control-row">
				<span class="mcvw__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="mcvw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'ML and LLM checkpoint vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="mcvw__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="mcvw__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="mcvw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="mcvw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="mcvw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="mcvw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="mcvw__seg-btn"
					:class="{ 'is-active': protectBestFinalWeights }"
					:aria-pressed="protectBestFinalWeights ? 'true' : 'false'"
					@click="protectBestFinalWeights = !protectBestFinalWeights">
					<span>{{ protectBestFinalWeights ? t('duplicatefinder', 'Shield best/final Weights: ON') : t('duplicatefinder', 'Shield best/final Weights: OFF') }}</span>
				</button>

				<button
					type="button"
					class="mcvw__seg-btn"
					:class="{ 'is-active': protectTokenizerAndConfig }"
					:aria-pressed="protectTokenizerAndConfig ? 'true' : 'false'"
					@click="protectTokenizerAndConfig = !protectTokenizerAndConfig">
					<span>{{ protectTokenizerAndConfig ? t('duplicatefinder', 'Shield tokenizer.json/config.json: ON') : t('duplicatefinder', 'Shield tokenizer.json/config.json: OFF') }}</span>
				</button>

				<button
					type="button"
					class="mcvw__seg-btn"
					:class="{ 'is-active': protectFp16SafetensorsMaster }"
					:aria-pressed="protectFp16SafetensorsMaster ? 'true' : 'false'"
					@click="protectFp16SafetensorsMaster = !protectFp16SafetensorsMaster">
					<span>{{ protectFp16SafetensorsMaster ? t('duplicatefinder', 'Shield FP16 Safetensors: ON') : t('duplicatefinder', 'Shield FP16 Safetensors: OFF') }}</span>
				</button>

				<button
					type="button"
					class="mcvw__seg-btn"
					:class="{ 'is-active': requireFp16MasterForQuantPrune }"
					:aria-pressed="requireFp16MasterForQuantPrune ? 'true' : 'false'"
					@click="requireFp16MasterForQuantPrune = !requireFp16MasterForQuantPrune">
					<span>{{ requireFp16MasterForQuantPrune ? t('duplicatefinder', 'Require FP16 Master for GGUF: ON') : t('duplicatefinder', 'Require FP16 Master for GGUF: OFF') }}</span>
				</button>

				<button
					type="button"
					class="mcvw__seg-btn"
					:class="{ 'is-active': protectDatasetShards }"
					:aria-pressed="protectDatasetShards ? 'true' : 'false'"
					@click="protectDatasetShards = !protectDatasetShards">
					<span>{{ protectDatasetShards ? t('duplicatefinder', 'Shield All Datasets: ON') : t('duplicatefinder', 'Shield All Datasets: OFF') }}</span>
				</button>
			</div>

			<div class="mcvw__control-row mcvw__inputs-row">
				<label class="mcvw__field">
					<span class="mcvw__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="mcvw__input">
						<option value="prune-caches-step-ckpts-keep-best">{{ t('duplicatefinder', 'Prune Caches & step-* (Keep best/final & Configs)') }}</option>
						<option value="consolidate-vault-hardlinks">{{ t('duplicatefinder', 'Hardlink-Consolidate Onto ML Vault') }}</option>
						<option value="prune-regenerable-caches-only">{{ t('duplicatefinder', 'Prune __pycache__/HF/wandb/lightning_logs Only') }}</option>
					</select>
				</label>

				<label class="mcvw__field">
					<span class="mcvw__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="mcvw__input">
						<option value="best-final-safetensors-first">{{ t('duplicatefinder', 'best/final, tokenizer/config & FP16 first') }}</option>
						<option value="newest-checkpoint-first">{{ t('duplicatefinder', 'Newest checkpoint mtime first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="mcvw__field">
					<span class="mcvw__field-label">{{ t('duplicatefinder', 'Keep Steps') }}</span>
					<input
						v-model="keepRecentCheckpointsInput"
						type="number"
						min="0"
						step="1"
						class="mcvw__input mcvw__num-input">
				</label>

				<label class="mcvw__field">
					<span class="mcvw__field-label">{{ t('duplicatefinder', 'Cache Age (d)') }}</span>
					<input
						v-model="staleCacheDaysInput"
						type="number"
						min="0"
						step="1"
						class="mcvw__input mcvw__num-input">
				</label>

				<label class="mcvw__field">
					<span class="mcvw__field-label">{{ t('duplicatefinder', 'Min Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="mcvw__input mcvw__num-input">
				</label>

				<label class="mcvw__field mcvw__field-grow">
					<span class="mcvw__field-label">{{ t('duplicatefinder', 'Filter Model, Quant or Cache') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="mcvw__input"
						:placeholder="t('duplicatefinder', 'e.g. llama, .safetensors, Q4_K_M, Q8_0, step-1000, .parquet, wandb')">
				</label>

				<label class="mcvw__field mcvw__field-grow">
					<span class="mcvw__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="mcvw__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="mcvw__field">
					<span class="mcvw__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="mcvw__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="cache_priority_desc">{{ t('duplicatefinder', 'Cache & step-* priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="mcvw__control-row">
				<span class="mcvw__control-label">{{ t('duplicatefinder', 'Vault Family') }}</span>
				<div
					class="mcvw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'ML and LLM checkpoint vault family filter')">
					<button
						type="button"
						class="mcvw__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="mcvw__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="mcvw__control-row">
				<span class="mcvw__control-label">{{ t('duplicatefinder', 'Lineage & Tier') }}</span>
				<div
					class="mcvw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'ML artifact lineage and verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="mcvw__seg-btn"
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
			class="mcvw__empty-filter"
			role="note">
			<p class="mcvw__empty-title">
				{{ t('duplicatefinder', 'No ML model weights, GGUF quantizations, step checkpoints, datasets, or caches match the active filters.') }}
			</p>
			<button
				type="button"
				class="mcvw__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="mcvw__workspace">
			<div
				class="mcvw__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Machine Learning and LLM Checkpoint clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="cluster.groupKey"
					type="button"
					class="mcvw__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.groupKey === cluster.groupKey }"
					@click="selectedClusterKey = cluster.groupKey">
					<div class="mcvw__cluster-top">
						<strong class="mcvw__cluster-name">{{ cluster.displayName }}</strong>
						<span
							class="mcvw__pill"
							:class="riskPillClass(cluster.riskState)">
							{{ formatRiskLabel(cluster.riskState) }}
						</span>
					</div>
					<div class="mcvw__cluster-meta">
						<span class="mcvw__tag">{{ cluster.modelWorkspace }}</span>
						<span class="mcvw__tag">{{ cluster.modelStem }}</span>
						<span class="mcvw__tag">{{ cluster.frameworkSuite }}</span>
					</div>
					<div class="mcvw__cluster-badges">
						<span
							class="mcvw__badge"
							:class="duplicationBadgeClass(cluster.duplicationClass)">
							{{ cluster.duplicationBadge }}
						</span>
						<span
							class="mcvw__badge"
							:class="lineageBadgeClass(cluster)">
							{{ cluster.lineageBadge }}
						</span>
						<span
							v-if="cluster.isDerivedGgufQuantFromFp16"
							class="mcvw__badge is-consolidate">
							{{ t('duplicatefinder', 'FP16 -> GGUF') }}
						</span>
					</div>
					<div class="mcvw__cluster-bottom">
						<span>{{ cluster.copiesCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="mcvw__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="mcvw__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="mcvw__inspector">
				<header class="mcvw__inspector-head">
					<div class="mcvw__inspector-title-wrap">
						<h4 class="mcvw__inspector-title">
							{{ selectedCluster.displayName }}
						</h4>
						<p class="mcvw__inspector-sub">
							{{ selectedCluster.vaultKey }} | {{ selectedCluster.frameworkSuite }} | {{ selectedCluster.familyLabel }}
						</p>
					</div>
					<div class="mcvw__inspector-actions">
						<button
							type="button"
							class="mcvw__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="mcvw__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="mcvw__lineage-grid">
					<div class="mcvw__lineage-item">
						<span class="mcvw__lineage-label">{{ t('duplicatefinder', 'Model Stem & Precision') }}</span>
						<strong class="mcvw__lineage-val">{{ selectedCluster.modelStem }} ({{ selectedCluster.quantOrPrecisionSpec }} / {{ selectedCluster.formatBadge }})</strong>
					</div>
					<div class="mcvw__lineage-item">
						<span class="mcvw__lineage-label">{{ t('duplicatefinder', 'Framework & Stage') }}</span>
						<strong class="mcvw__lineage-val">{{ selectedCluster.frameworkSuite }} / {{ selectedCluster.artifactStage }}</strong>
					</div>
					<div class="mcvw__lineage-item">
						<span class="mcvw__lineage-label">{{ t('duplicatefinder', 'FP16 / best-final / Tokenizer Lineage') }}</span>
						<strong class="mcvw__lineage-val">
							{{ selectedCluster.duplicationBadge }} | {{ selectedCluster.lineageBadge }}
						</strong>
					</div>
					<div class="mcvw__lineage-item">
						<span class="mcvw__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="mcvw__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableGb }})
						</strong>
					</div>
				</div>

				<div class="mcvw__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.selectionKey"
						class="mcvw__member-card">
						<div class="mcvw__member-top">
							<code class="mcvw__member-path">{{ member.path }}</code>
							<div class="mcvw__member-pills">
								<span
									class="mcvw__pill"
									:class="member.meta.isBestOrFinalWeight || member.meta.isTokenizerOrConfig || member.meta.isFp16SafetensorsMaster ? 'is-keep' : (member.meta.isRegenerableCache || member.meta.isIntermediateStepCheckpoint ? 'is-warn' : 'is-consolidate')">
									{{ member.meta.artifactKindBadge }}
								</span>
								<span
									class="mcvw__pill"
									:class="authorityPillClass(member.authorityScore)">
									{{ t('duplicatefinder', 'Authority {score}', { score: member.authorityScore }) }}
								</span>
								<span
									class="mcvw__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdict }}
								</span>
							</div>
						</div>
						<div class="mcvw__member-bottom">
							<div class="mcvw__member-meta">
								<span>{{ member.formattedSize }}</span>
								<span>{{ member.formattedMtime }}</span>
								<span>{{ member.verdictReason }}</span>
							</div>
							<label
								v-if="member.verdict !== 'keep-canonical-survivor'"
								class="mcvw__override-field">
								<span class="mcvw__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
								<select
									class="mcvw__override-select"
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

				<div class="mcvw__code-panels">
					<div class="mcvw__code-box">
						<div class="mcvw__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="mcvw__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="mcvw__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="mcvw__code-box">
						<div class="mcvw__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="mcvw__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="mcvw__pre"><code>{{ generatedSyncExclude }}</code></pre>
					</div>
				</div>
			</div>
		</div>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	ML_CHECKPOINT_PRESETS,
	analyzeMlCheckpointVault,
	buildMlCheckpointVaultCsvReport,
	buildMlCheckpointVaultJsonReport,
	buildMlCheckpointVaultRemediationScript,
	buildMlCheckpointVaultSyncExcludeSnippet,
} from '../tools/mlCheckpointVaultAuditor'

export default {
	name: 'MlCheckpointVaultWorkbench',
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
			presetId: 'all-ml-checkpoint-vault-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-caches-step-ckpts-keep-best',
			survivorRule: 'best-final-safetensors-first',
			protectBestFinalWeights: true,
			protectTokenizerAndConfig: true,
			protectFp16SafetensorsMaster: true,
			requireFp16MasterForQuantPrune: true,
			protectDatasetShards: false,
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
			return ML_CHECKPOINT_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'best-final-weights', label: this.t('duplicatefinder', 'best/final Weights') },
				{ id: 'tokenizer-configs', label: this.t('duplicatefinder', 'tokenizer.json/config.json') },
				{ id: 'gguf-quantized', label: this.t('duplicatefinder', 'GGUF Q4_K_M/Q8_0') },
				{ id: 'step-checkpoints', label: this.t('duplicatefinder', 'checkpoints/step-*') },
				{ id: 'datasets', label: this.t('duplicatefinder', 'Datasets (.parquet/.arrow/.jsonl)') },
				{ id: 'regenerable-caches', label: this.t('duplicatefinder', 'Caches (__pycache__/HF/wandb)') },
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
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed >= 0 ? parsed : 2
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
			return analyzeMlCheckpointVault(this.activePool, {
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectBestFinalWeights: this.protectBestFinalWeights,
				protectTokenizerAndConfig: this.protectTokenizerAndConfig,
				protectFp16SafetensorsMaster: this.protectFp16SafetensorsMaster,
				requireFp16MasterForQuantPrune: this.requireFp16MasterForQuantPrune,
				protectDatasetShards: this.protectDatasetShards,
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
			return buildMlCheckpointVaultRemediationScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
		generatedSyncExclude() {
			return buildMlCheckpointVaultSyncExcludeSnippet(this.analysis)
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
			const preset = ML_CHECKPOINT_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectBestFinalWeights = preset.protectBestFinalWeights
			this.protectTokenizerAndConfig = preset.protectTokenizerAndConfig
			this.protectFp16SafetensorsMaster = preset.protectFp16SafetensorsMaster
			this.requireFp16MasterForQuantPrune = preset.requireFp16MasterForQuantPrune
			this.protectDatasetShards = preset.protectDatasetShards
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
		duplicationBadgeClass(duplicationClass) {
			if (duplicationClass === 'model-weight-master' || duplicationClass === 'tokenizer-config') {
				return 'is-keep'
			}
			if (duplicationClass === 'regenerable-cache' || duplicationClass === 'step-checkpoint') {
				return 'is-warn'
			}
			return 'is-consolidate'
		},
		lineageBadgeClass(cluster) {
			if (cluster.hasBestOrFinalInVault || cluster.hasTokenizerConfigInVault) {
				return 'is-keep'
			}
			if (cluster.hasFp16SafetensorsMaster) {
				return 'is-consolidate'
			}
			return 'is-warn'
		},
		formatRiskLabel(riskState) {
			const map = {
				reclaimable: this.t('duplicatefinder', 'Reclaimable'),
				consolidatable: this.t('duplicatefinder', 'Hardlink Ready'),
				'cache-reclaimable': this.t('duplicatefinder', 'ML Cache Reclaimable'),
				'step-ckpt-reclaimable': this.t('duplicatefinder', 'step-* Reclaimable'),
				'gguf-quant-reclaimable': this.t('duplicatefinder', 'GGUF Twin Reclaimable'),
				'best-final-protected': this.t('duplicatefinder', 'best/final Protected'),
				'tokenizer-config-protected': this.t('duplicatefinder', 'Tokenizer/Config Protected'),
				'fp16-master-protected': this.t('duplicatefinder', 'FP16 Master Protected'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		riskPillClass(riskState) {
			if (riskState === 'best-final-protected' || riskState === 'tokenizer-config-protected') {
				return 'is-danger'
			}
			if (riskState === 'fp16-master-protected' || riskState === 'shielded') {
				return 'is-warn'
			}
			if (riskState === 'consolidatable' || riskState === 'gguf-quant-reclaimable') {
				return 'is-consolidate'
			}
			return 'is-reclaim'
		},
		verdictPillClass(verdict) {
			if (verdict === 'keep-canonical-survivor') {
				return 'is-keep'
			}
			if (verdict === 'blocked-best-final-weights' || verdict === 'blocked-tokenizer-config') {
				return 'is-danger'
			}
			if (verdict.startsWith('blocked-')) {
				return 'is-warn'
			}
			if (verdict === 'consolidate-hardlink-ml-asset') {
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
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 ML & LLM Checkpoint remediation script to clipboard.'))
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
			const csv = buildMlCheckpointVaultCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-ml-checkpoint-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe ML & LLM Checkpoint CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildMlCheckpointVaultJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-ml-checkpoint-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported ML & LLM Checkpoint JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.ml-checkpoint-vault-workbench {
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

.mcvw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.mcvw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.mcvw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.mcvw__status-badge {
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

.mcvw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.mcvw__tool-btn,
.mcvw__seg-btn,
.mcvw__primary-btn,
.mcvw__load-more-btn,
.mcvw__mini-btn {
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

.mcvw__tool-btn:hover:not(:disabled),
.mcvw__seg-btn:hover:not(:disabled),
.mcvw__load-more-btn:hover:not(:disabled),
.mcvw__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.mcvw__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.mcvw__tool-btn.is-primary-outline,
.mcvw__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.mcvw__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.mcvw__tool-btn:focus-visible,
.mcvw__seg-btn:focus-visible,
.mcvw__primary-btn:focus-visible,
.mcvw__load-more-btn:focus-visible,
.mcvw__mini-btn:focus-visible,
.mcvw__cluster-card:focus-visible,
.mcvw__input:focus-visible,
.mcvw__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.mcvw__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.mcvw__notice.is-success {
	background-color: var(--color-background-hover);
	border-color: var(--color-success, #2d8a4e);
}

.mcvw__notice.is-error {
	background-color: var(--color-background-hover);
	border-color: var(--color-error, #b91c1c);
}

.mcvw__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.mcvw__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.mcvw__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.mcvw__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.mcvw__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.mcvw__kpi-val.is-warn {
	color: var(--color-warning-text, var(--color-main-text));
}

.mcvw__empty-banner,
.mcvw__empty-filter {
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

.mcvw__empty-text {
	flex: 1 1 240px;
	min-inline-size: 0;
}

.mcvw__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.mcvw__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.mcvw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.mcvw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.mcvw__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 96px;
}

.mcvw__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.mcvw__inputs-row {
	align-items: flex-end;
}

.mcvw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.mcvw__field-grow {
	flex: 1 1 180px;
}

.mcvw__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.mcvw__input,
.mcvw__override-select {
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

.mcvw__num-input {
	inline-size: 96px;
}

.mcvw__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.mcvw__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.mcvw__cluster-card {
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

.mcvw__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.mcvw__cluster-top,
.mcvw__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.mcvw__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.mcvw__cluster-meta,
.mcvw__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.mcvw__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.mcvw__badge,
.mcvw__pill {
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

.mcvw__pill.is-keep,
.mcvw__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.mcvw__pill.is-danger,
.mcvw__badge.is-danger {
	border-color: var(--color-error, #b91c1c);
}

.mcvw__pill.is-consolidate,
.mcvw__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.mcvw__pill.is-warn,
.mcvw__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.mcvw__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.mcvw__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.mcvw__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.mcvw__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.mcvw__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.mcvw__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.mcvw__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.mcvw__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.mcvw__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.mcvw__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.mcvw__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.mcvw__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.mcvw__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.mcvw__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.mcvw__member-top,
.mcvw__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.mcvw__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.mcvw__member-pills {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.mcvw__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.mcvw__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.mcvw__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.mcvw__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.mcvw__pre {
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

.mcvw__sr-only {
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
	.mcvw__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.mcvw__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.mcvw__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.ml-checkpoint-vault-workbench {
		padding: 10px;
	}

	.mcvw__kpis,
	.mcvw__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.mcvw__num-input {
		inline-size: 100%;
	}

	.mcvw__field {
		flex: 1 1 100%;
	}
}
</style>
