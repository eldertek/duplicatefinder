<template>
	<section
		class="scientific-bundle-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Scientific, GIS, CAD/BIM and ML-Shard Companion-Bundle Auditor')">
		<header class="sbw__toolbar">
			<div class="sbw__title-group">
				<h3 class="sbw__title">
					{{ t('duplicatefinder', 'Scientific, GIS, CAD/BIM & ML-Shard Companion-Bundle Auditor') }}
				</h3>
				<span
					class="sbw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{bundles} bundles / {reclaim} atomic reclaim / {collateral} companion collateral guarded', {
						bundles: analysis.summary.totalBundlesCount,
						reclaim: analysis.summary.formattedAtomicReclaimableBytes,
						collateral: analysis.summary.formattedOrphanCollateralBytes,
					}) }}
				</span>
			</div>

			<div class="sbw__toolbar-actions">
				<button
					type="button"
					class="sbw__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="sbw__tool-btn"
					:disabled="analysis.bundles.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="sbw__tool-btn"
					@click="copyAtomicScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="sbw__tool-btn is-close"
					aria-keyshortcuts="+"
					:title="t('duplicatefinder', 'Hide scientific, GIS, CAD/BIM and ML-shard companion-bundle auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Bundle Auditor') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="sbw__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="sbw__empty-banner"
			role="note">
			<div class="sbw__empty-text">
				<p class="sbw__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure scientific bundle safety rules before scanning') }}
				</p>
				<p class="sbw__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit GIS shapefiles (.shp/.shx/.dbf/.prj), medical NIfTI/DICOM studies, CAD/BIM assemblies (.obj/.mtl, .gltf/.bin, .sldasm/.ifc), and sharded ML weights (.safetensors/.onnx) atomically.') }}
				</p>
			</div>
			<button
				type="button"
				class="sbw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="sbw__controls">
			<div class="sbw__control-row">
				<span class="sbw__control-label">{{ t('duplicatefinder', 'Audit Preset') }}</span>
				<div
					class="sbw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Scientific bundle audit presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="sbw__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="sbw__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="sbw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="sbw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="sbw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="sbw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="sbw__seg-btn"
					:class="{ 'is-active': protectClinicalPaths }"
					:aria-pressed="protectClinicalPaths ? 'true' : 'false'"
					@click="protectClinicalPaths = !protectClinicalPaths">
					<span>{{ protectClinicalPaths ? t('duplicatefinder', 'Clinical / IRB Shield: ON') : t('duplicatefinder', 'Clinical / IRB Shield: OFF') }}</span>
				</button>

				<button
					type="button"
					class="sbw__seg-btn"
					:class="{ 'is-active': protectAssemblyRefs }"
					:aria-pressed="protectAssemblyRefs ? 'true' : 'false'"
					@click="protectAssemblyRefs = !protectAssemblyRefs">
					<span>{{ protectAssemblyRefs ? t('duplicatefinder', 'Assembly / ML Anchor Guard: ON') : t('duplicatefinder', 'Assembly / ML Anchor Guard: OFF') }}</span>
				</button>
			</div>

			<div class="sbw__control-row sbw__inputs-row">
				<label class="sbw__field">
					<span class="sbw__field-label">{{ t('duplicatefinder', 'Action Strategy') }}</span>
					<select v-model="strategy" class="sbw__input">
						<option value="atomic-purge">{{ t('duplicatefinder', 'Atomic Bundle Purge (+companions)') }}</option>
						<option value="hardlink-preserve">{{ t('duplicatefinder', 'Hardlink / Reflink (preserve paths)') }}</option>
					</select>
				</label>

				<label class="sbw__field">
					<span class="sbw__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="sbw__input">
						<option value="complete-bundle-first">{{ t('duplicatefinder', 'Complete companion bundle first') }}</option>
						<option value="production-first">{{ t('duplicatefinder', 'Clinical / production path first') }}</option>
						<option value="oldest-mtime">{{ t('duplicatefinder', 'Oldest modified bundle') }}</option>
						<option value="newest-mtime">{{ t('duplicatefinder', 'Newest capture / export') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="sbw__field">
					<span class="sbw__field-label">{{ t('duplicatefinder', 'Min Bundle Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="sbw__input sbw__num-input">
				</label>

				<label class="sbw__field sbw__field-grow">
					<span class="sbw__field-label">{{ t('duplicatefinder', 'Filter Bundle, Companion or Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="sbw__input"
						:placeholder="t('duplicatefinder', 'e.g. .shp, .dbf, nii.gz, safetensors, /GIS')">
				</label>

				<label class="sbw__field sbw__field-grow">
					<span class="sbw__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="sbw__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="sbw__field">
					<span class="sbw__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="sbw__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Atomic reclaimable bytes') }}</option>
						<option value="collateral_desc">{{ t('duplicatefinder', 'Companion collateral guarded') }}</option>
						<option value="completeness_asc">{{ t('duplicatefinder', 'Incomplete bundles first') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Bundle name (A-Z)') }}</option>
					</select>
				</label>
			</div>
		</div>

		<div class="sbw__kpis">
			<div class="sbw__kpi">
				<span class="sbw__kpi-label">{{ t('duplicatefinder', 'Atomic Bundle Reclaimable') }}</span>
				<strong class="sbw__kpi-val is-accent">
					{{ analysis.summary.formattedAtomicReclaimableBytes }} ({{ analysis.summary.atomicReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="sbw__kpi">
				<span class="sbw__kpi-label">{{ t('duplicatefinder', 'Orphan Collateral Guarded') }}</span>
				<strong class="sbw__kpi-val is-warn">
					{{ analysis.summary.formattedOrphanCollateralBytes }}
				</strong>
			</div>
			<div class="sbw__kpi">
				<span class="sbw__kpi-label">{{ t('duplicatefinder', 'Incomplete / Shielded') }}</span>
				<strong class="sbw__kpi-val">
					{{ analysis.summary.incompleteBundlesCount }} {{ t('duplicatefinder', 'incomplete') }} / {{ analysis.summary.shieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="sbw__kpi">
				<span class="sbw__kpi-label">{{ t('duplicatefinder', 'Raw Duplicate Footprint') }}</span>
				<strong class="sbw__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty"
			class="sbw__filters-strip">
			<div
				class="sbw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by scientific domain')">
				<button
					type="button"
					class="sbw__chip"
					:class="{ 'is-active': domainFilter === 'all' }"
					:aria-pressed="domainFilter === 'all' ? 'true' : 'false'"
					@click="domainFilter = 'all'">
					<span>{{ t('duplicatefinder', 'All Domains ({count})', { count: totalDomainMatches }) }}</span>
				</button>
				<button
					v-for="domainItem in domainOptions"
					:key="domainItem.id"
					type="button"
					class="sbw__chip"
					:class="{ 'is-active': domainFilter === domainItem.id }"
					:aria-pressed="domainFilter === domainItem.id ? 'true' : 'false'"
					@click="domainFilter = domainItem.id">
					<span>{{ domainItem.label }} ({{ analysis.summary.domainCounts[domainItem.id] || 0 }})</span>
				</button>
			</div>

			<div
				class="sbw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by bundle integrity verdict')">
				<button
					v-for="verdictOpt in verdictFilterOptions"
					:key="verdictOpt.id"
					type="button"
					class="sbw__chip"
					:class="{ 'is-active': verdictFilter === verdictOpt.id }"
					:aria-pressed="verdictFilter === verdictOpt.id ? 'true' : 'false'"
					@click="verdictFilter = verdictOpt.id">
					<span>{{ verdictOpt.label }}</span>
				</button>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty && analysis.bundles.length === 0"
			class="sbw__empty-banner"
			role="note">
			<div class="sbw__empty-text">
				<p class="sbw__empty-title">
					{{ t('duplicatefinder', 'No GIS, medical, CAD/BIM, or ML companion bundles match the active filters') }}
				</p>
				<p class="sbw__empty-hint">
					{{ t('duplicatefinder', 'Lower the minimum bundle size threshold, clear the search query, or switch to All Domains.') }}
				</p>
			</div>
			<button
				type="button"
				class="sbw__primary-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.bundles.length > 0"
			class="sbw__workstation">
			<div class="sbw__list-pane">
				<div class="sbw__pane-header">
					<span class="sbw__pane-title">
						{{ t('duplicatefinder', 'Companion Bundles ({shown}/{total})', { shown: visibleBundles.length, total: analysis.bundles.length }) }}
					</span>
				</div>

				<div
					class="sbw__bundle-list"
					role="listbox"
					:aria-label="t('duplicatefinder', 'Audited scientific and engineering companion bundles')">
					<button
						v-for="bundle in visibleBundles"
						:key="bundle.groupKey"
						type="button"
						role="option"
						class="sbw__bundle-item"
						:class="{ 'is-selected': selectedBundle && selectedBundle.groupKey === bundle.groupKey }"
						:aria-selected="selectedBundle && selectedBundle.groupKey === bundle.groupKey ? 'true' : 'false'"
						@click="selectedBundleKey = bundle.groupKey">
						<div class="sbw__bundle-top">
							<span class="sbw__bundle-name">
								{{ bundle.displayName }}.{{ bundle.extension }}
							</span>
							<span
								class="sbw__pill"
								:class="`is-risk-${bundle.groupRiskState}`">
								{{ formatGroupRiskLabel(bundle.groupRiskState) }}
							</span>
						</div>
						<div class="sbw__bundle-path">
							{{ bundle.specLabel }} | {{ bundle.survivor.dirPath }}
						</div>
						<div class="sbw__bundle-meta">
							<span>{{ bundle.domainLabel }}</span>
							<span>{{ bundle.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
							<span>{{ t('duplicatefinder', 'Atomic Reclaim:') }} {{ bundle.formattedAtomicReclaimableBytes }}</span>
						</div>
					</button>
				</div>

				<div
					v-if="analysis.bundles.length > visibleBundles.length"
					class="sbw__load-more-wrap">
					<button
						type="button"
						class="sbw__seg-btn"
						@click="visibleLimit += 25">
						<span>{{ t('duplicatefinder', 'Show more bundles ({remaining} remaining)', { remaining: analysis.bundles.length - visibleBundles.length }) }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="selectedBundle"
				class="sbw__inspector-pane">
				<div class="sbw__inspector-header">
					<div class="sbw__inspector-title-wrap">
						<h4 class="sbw__inspector-title">
							{{ selectedBundle.displayName }}.{{ selectedBundle.extension }}
						</h4>
						<span class="sbw__inspector-sub">
							{{ selectedBundle.specLabel }} | {{ selectedBundle.domainLabel }}
						</span>
					</div>
					<div class="sbw__inspector-actions">
						<button
							type="button"
							class="sbw__tool-btn"
							@click="jumpToDuplicate(selectedBundle)">
							<span>{{ t('duplicatefinder', 'Jump to Group') }}</span>
						</button>
						<button
							type="button"
							class="sbw__tool-btn"
							@click="compareDuplicate(selectedBundle)">
							<span>{{ t('duplicatefinder', 'Compare Side-by-Side') }}</span>
						</button>
					</div>
				</div>

				<div
					v-if="selectedBundle.hasIncompleteMember"
					class="sbw__warn-banner"
					role="note">
					{{ t('duplicatefinder', 'Incomplete companion bundle detected: at least one location is missing mandatory files ({mandatory}). Complete copies are automatically preserved as canonical survivors.', {
						mandatory: selectedBundle.mandatoryExts.join(', ') || 'primary dataset',
					}) }}
				</div>

				<div
					v-else-if="selectedBundle.hasOrphanCollateralRisk"
					class="sbw__info-banner"
					role="note">
					{{ t('duplicatefinder', 'Companion collateral protection active: naive single-file deletion would strand {collateral} of sibling metadata. Use the atomic bundle plan below to purge or hardlink companion files together.', {
						collateral: selectedBundle.formattedOrphanCollateralBytes,
					}) }}
				</div>

				<div class="sbw__meta-grid">
					<div class="sbw__meta-item">
						<span class="sbw__meta-label">{{ t('duplicatefinder', 'Canonical Survivor') }}</span>
						<span class="sbw__mono-text">{{ selectedBundle.survivor.normalizedPath }}</span>
					</div>
					<div class="sbw__meta-item">
						<span class="sbw__meta-label">{{ t('duplicatefinder', 'Mandatory Companions') }}</span>
						<span>
							{{ selectedBundle.mandatoryExts.length > 0 ? selectedBundle.mandatoryExts.join(', ') : t('duplicatefinder', 'None required (optional sidecars paired)') }}
						</span>
					</div>
					<div class="sbw__meta-item">
						<span class="sbw__meta-label">{{ t('duplicatefinder', 'Total Bundle Footprint') }}</span>
						<span>{{ selectedBundle.formattedBundleTotalFootprintBytes }}</span>
					</div>
					<div class="sbw__meta-item">
						<span class="sbw__meta-label">{{ t('duplicatefinder', 'Atomic Reclaim / Collateral') }}</span>
						<span>{{ selectedBundle.formattedAtomicReclaimableBytes }} / {{ selectedBundle.formattedOrphanCollateralBytes }}</span>
					</div>
				</div>

				<div class="sbw__override-bar">
					<span class="sbw__control-label">{{ t('duplicatefinder', 'Bundle Override:') }}</span>
					<button
						type="button"
						class="sbw__seg-btn"
						:class="{ 'is-active': selectedBundle.groupOverride === 'auto' }"
						@click="setGroupOverride(selectedBundle.groupKey, 'auto')">
						<span>{{ t('duplicatefinder', 'Auto') }}</span>
					</button>
					<button
						type="button"
						class="sbw__seg-btn"
						:class="{ 'is-active': selectedBundle.groupOverride === 'shield' }"
						@click="setGroupOverride(selectedBundle.groupKey, 'shield')">
						<span>{{ t('duplicatefinder', 'Shield Bundle') }}</span>
					</button>
					<button
						type="button"
						class="sbw__seg-btn"
						:class="{ 'is-active': selectedBundle.groupOverride === 'exclude' }"
						@click="setGroupOverride(selectedBundle.groupKey, 'exclude')">
						<span>{{ t('duplicatefinder', 'Exclude') }}</span>
					</button>
				</div>

				<div class="sbw__member-list">
					<div
						v-for="member in selectedBundle.members"
						:key="member.selectionKey"
						class="sbw__member-card"
						:class="`is-verdict-${member.verdict}`">
						<div class="sbw__member-top">
							<span class="sbw__member-name">{{ member.fileName }}</span>
							<div class="sbw__member-badges">
								<span
									class="sbw__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdictLabel }}
								</span>
								<span
									class="sbw__pill"
									:class="completenessPillClass(member.context.completenessStatus)">
									{{ formatCompletenessLabel(member.context.completenessStatus, member.context.completenessScore) }}
								</span>
							</div>
						</div>

						<div class="sbw__member-path">
							{{ member.normalizedPath }}
						</div>

						<div class="sbw__member-meta">
							<span>{{ t('duplicatefinder', 'Primary:') }} {{ member.formattedSize }}</span>
							<span>{{ t('duplicatefinder', 'Companions:') }} {{ member.context.companionCount }} ({{ formatMemberCompanionBytes(member) }})</span>
							<span>{{ t('duplicatefinder', 'Modified:') }} {{ member.formattedMtime || t('duplicatefinder', 'Unknown') }}</span>
						</div>

						<div
							v-if="member.context.missingMandatory.length > 0"
							class="sbw__missing-note">
							{{ t('duplicatefinder', 'Missing mandatory companion(s): {missing}', { missing: member.context.missingMandatory.join(', ') }) }}
						</div>

						<div
							v-if="member.context.companionFiles.length > 0"
							class="sbw__companion-chips">
							<span
								v-for="comp in member.context.companionFiles"
								:key="comp.normalizedPath"
								class="sbw__companion-chip"
								:title="comp.normalizedPath">
								{{ comp.fileName }}
							</span>
						</div>

						<p class="sbw__member-note">
							{{ member.verdictReason }}
						</p>

						<div
							v-if="member.role !== 'survivor'"
							class="sbw__override-bar">
							<button
								type="button"
								class="sbw__seg-btn"
								:class="{ 'is-active': getCopyOverride(member.selectionKey) === 'auto' }"
								@click="setCopyOverride(member.selectionKey, 'auto')">
								<span>{{ t('duplicatefinder', 'Auto') }}</span>
							</button>
							<button
								type="button"
								class="sbw__seg-btn"
								:class="{ 'is-active': getCopyOverride(member.selectionKey) === 'pin-keeper' }"
								@click="setCopyOverride(member.selectionKey, 'pin-keeper')">
								<span>{{ t('duplicatefinder', 'Pin Keeper') }}</span>
							</button>
							<button
								type="button"
								class="sbw__seg-btn"
								:class="{ 'is-active': getCopyOverride(member.selectionKey) === 'force-purge' }"
								@click="setCopyOverride(member.selectionKey, 'force-purge')">
								<span>{{ t('duplicatefinder', 'Force Atomic Purge') }}</span>
							</button>
							<button
								type="button"
								class="sbw__seg-btn"
								:class="{ 'is-active': getCopyOverride(member.selectionKey) === 'shield' }"
								@click="setCopyOverride(member.selectionKey, 'shield')">
								<span>{{ t('duplicatefinder', 'Shield Copy') }}</span>
							</button>
						</div>
					</div>
				</div>

				<details class="sbw__script-box">
					<summary class="sbw__script-summary">
						{{ t('duplicatefinder', 'POSIX DRY_RUN=1 Atomic Bundle & occ files:scan Script') }}
					</summary>
					<div class="sbw__script-content">
						<div class="sbw__script-actions">
							<button
								type="button"
								class="sbw__tool-btn"
								@click="copyAtomicScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="sbw__code-pre"><code>{{ generatedScript }}</code></pre>
					</div>
				</details>
			</div>
		</div>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import { formatBytes } from '../tools/duplicateStats'
import {
	SCIENTIFIC_DOMAIN_META,
	SCIENTIFIC_PRESETS,
	analyzeScientificBundles,
	buildScientificBundleCsvReport,
	buildScientificBundleJsonReport,
	buildScientificBundleScript,
} from '../tools/scientificBundleAuditor'

export default {
	name: 'ScientificBundleWorkbench',
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
			presetId: 'all-scientific',
			scope: 'filtered',
			domainFilter: 'all',
			verdictFilter: 'all',
			strategy: 'atomic-purge',
			survivorRule: 'complete-bundle-first',
			protectClinicalPaths: true,
			protectAssemblyRefs: true,
			minSizeMbInput: '0',
			searchQueryInput: '',
			dataRootInput: '/var/www/nextcloud/data',
			sortMode: 'reclaim_desc',
			selectedBundleKey: '',
			visibleLimit: 25,
			groupOverrides: {},
			copyOverrides: {},
			statusNotice: '',
			statusNoticeType: 'success',
		}
	},
	computed: {
		presets() {
			return SCIENTIFIC_PRESETS
		},
		domainOptions() {
			return Object.values(SCIENTIFIC_DOMAIN_META)
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'atomic-reclaimable', label: this.t('duplicatefinder', 'Atomic Reclaimable') },
				{ id: 'orphan-collateral-risk', label: this.t('duplicatefinder', 'Companion Collateral Risk') },
				{ id: 'incomplete-bundle', label: this.t('duplicatefinder', 'Incomplete Bundle') },
				{ id: 'shielded', label: this.t('duplicatefinder', 'Shielded / Protected') },
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
		parsedMinSizeMb() {
			const trimmed = String(this.minSizeMbInput ?? '').trim()
			if (!trimmed) {
				return 0
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
		},
		analysis() {
			return analyzeScientificBundles(this.activePool, {
				domainFilter: this.domainFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectClinicalPaths: this.protectClinicalPaths,
				protectAssemblyRefs: this.protectAssemblyRefs,
				minSizeMb: this.parsedMinSizeMb,
				searchQuery: this.searchQueryInput,
				groupOverrides: this.groupOverrides,
				copyOverrides: this.copyOverrides,
			})
		},
		totalDomainMatches() {
			const counts = this.analysis.summary.domainCounts || {}
			return Object.values(counts).reduce((sum, val) => sum + Number(val || 0), 0)
		},
		visibleBundles() {
			return this.analysis.bundles.slice(0, this.visibleLimit)
		},
		selectedBundle() {
			const bundles = this.analysis.bundles
			if (!bundles.length) {
				return null
			}
			if (this.selectedBundleKey) {
				const found = bundles.find(b => b.groupKey === this.selectedBundleKey)
				if (found) {
					return found
				}
			}
			if (this.currentDuplicateId !== null && this.currentDuplicateId !== undefined) {
				const byCurrent = bundles.find(b => b.primaryGroupId === this.currentDuplicateId)
				if (byCurrent) {
					return byCurrent
				}
			}
			return bundles[0]
		},
		generatedScript() {
			return buildScientificBundleScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
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
			const preset = SCIENTIFIC_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.domainFilter = preset.domainFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectClinicalPaths = preset.protectClinicalPaths
			this.protectAssemblyRefs = preset.protectAssemblyRefs
			this.minSizeMbInput = String(preset.minSizeMb)
			this.verdictFilter = 'all'
			this.visibleLimit = 25
		},
		resetFilters() {
			this.domainFilter = 'all'
			this.verdictFilter = 'all'
			this.minSizeMbInput = '0'
			this.searchQueryInput = ''
			this.visibleLimit = 25
		},
		getCopyOverride(selectionKey) {
			return this.copyOverrides[selectionKey] || 'auto'
		},
		setGroupOverride(groupKey, value) {
			this.$set(this.groupOverrides, groupKey, value)
		},
		setCopyOverride(selectionKey, value) {
			this.$set(this.copyOverrides, selectionKey, value)
		},
		formatMemberCompanionBytes(member) {
			return formatBytes(member?.context?.companionBytes || 0)
		},
		formatGroupRiskLabel(riskState) {
			const map = {
				'healthy-reclaimable': this.t('duplicatefinder', 'Atomic Reclaimable'),
				'orphan-collateral-risk': this.t('duplicatefinder', 'Companion Collateral'),
				'incomplete-bundle': this.t('duplicatefinder', 'Incomplete Bundle'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		verdictPillClass(verdict) {
			if (verdict === 'keep-canonical-bundle') {
				return 'is-keep'
			}
			if (verdict === 'blocked-clinical-shield' || verdict === 'blocked-assembly-ref' || verdict === 'blocked-incomplete-anchor') {
				return 'is-danger'
			}
			if (verdict === 'blocked-manual-shield' || verdict === 'excluded') {
				return 'is-warn'
			}
			if (verdict === 'hardlink-bundle-candidate') {
				return 'is-hardlink'
			}
			return 'is-reclaim'
		},
		completenessPillClass(status) {
			if (status === 'complete') {
				return 'is-keep'
			}
			if (status === 'incomplete') {
				return 'is-danger'
			}
			return 'is-warn'
		},
		formatCompletenessLabel(status, score) {
			if (status === 'complete') {
				return this.t('duplicatefinder', 'Complete ({score}%)', { score })
			}
			if (status === 'incomplete') {
				return this.t('duplicatefinder', 'Incomplete ({score}%)', { score })
			}
			return this.t('duplicatefinder', 'Companion-only ({score}%)', { score })
		},
		findSourceDuplicate(bundle) {
			if (!bundle) {
				return null
			}
			return this.activePool.find(g => g && g.id === bundle.primaryGroupId)
				|| this.activePool.find(g => g && g.hash && g.hash === bundle.hash)
				|| null
		},
		jumpToDuplicate(bundle) {
			const target = this.findSourceDuplicate(bundle)
			if (target) {
				this.$emit('select-duplicate', target)
			}
		},
		compareDuplicate(bundle) {
			const target = this.findSourceDuplicate(bundle)
			if (target) {
				this.$emit('compare-duplicate', target)
			}
		},
		async copyAtomicScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 atomic bundle remediation script to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy script to clipboard.'), 'error')
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
			const csv = buildScientificBundleCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-scientific-bundles.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe scientific bundle CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildScientificBundleJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-scientific-bundles.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported scientific bundle JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.scientific-bundle-workbench {
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

.sbw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.sbw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.sbw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.sbw__status-badge {
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

.sbw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.sbw__tool-btn,
.sbw__seg-btn,
.sbw__chip,
.sbw__primary-btn {
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

.sbw__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, #ffffff);
}

.sbw__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.sbw__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element, #0082c9);
}

.sbw__seg-btn.is-active,
.sbw__chip.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.sbw__tool-btn:focus-visible,
.sbw__seg-btn:focus-visible,
.sbw__chip:focus-visible,
.sbw__primary-btn:focus-visible,
.sbw__bundle-item:focus-visible,
.sbw__input:focus-visible,
.sbw__script-summary:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.sbw__notice {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	font-size: 0.86rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.sbw__notice.is-success {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.sbw__notice.is-error {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.sbw__empty-banner {
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

.sbw__empty-text {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 68ch;
}

.sbw__empty-title {
	margin: 0;
	font-weight: 700;
	font-size: 0.94rem;
}

.sbw__empty-hint {
	margin: 0;
	font-size: 0.85rem;
	color: var(--color-text-maxcontrast);
	line-height: 1.45;
}

.sbw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
}

.sbw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.sbw__control-label {
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.sbw__segments,
.sbw__chip-group,
.sbw__filters-strip {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.sbw__filters-strip {
	flex-direction: column;
	gap: 8px;
}

.sbw__inputs-row {
	align-items: flex-end;
}

.sbw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.sbw__field-grow {
	flex: 1 1 200px;
}

.sbw__field-label {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.sbw__input {
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

.sbw__num-input {
	inline-size: 115px;
}

.sbw__kpis {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 10px;
}

@media (min-width: 560px) {
	.sbw__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (min-width: 980px) {
	.sbw__kpis {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
}

.sbw__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.sbw__kpi-label {
	font-size: 0.76rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.sbw__kpi-val {
	font-size: 1.02rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.sbw__kpi-val.is-accent {
	color: #0b4a8b;
}

.sbw__kpi-val.is-warn {
	color: #7c4a03;
}

.sbw__workstation {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 14px;
}

@media (min-width: 1080px) {
	.sbw__workstation {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
		align-items: start;
	}
}

.sbw__list-pane,
.sbw__inspector-pane {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.sbw__pane-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.sbw__pane-title {
	font-size: 0.88rem;
	font-weight: 700;
}

.sbw__bundle-list,
.sbw__member-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.sbw__bundle-item {
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

.sbw__bundle-item.is-selected {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light);
}

.sbw__bundle-top,
.sbw__member-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.sbw__bundle-name,
.sbw__member-name {
	font-weight: 700;
	font-size: 0.9rem;
	overflow-wrap: anywhere;
}

.sbw__bundle-path,
.sbw__member-path {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.sbw__bundle-meta,
.sbw__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.sbw__pill {
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.72rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.sbw__pill.is-risk-incomplete-bundle,
.sbw__pill.is-danger {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.sbw__pill.is-risk-orphan-collateral-risk,
.sbw__pill.is-risk-shielded,
.sbw__pill.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.sbw__pill.is-hardlink {
	background-color: #e8f1fb;
	color: #0b4a8b;
	border-color: #9ec5fe;
}

.sbw__pill.is-risk-healthy-reclaimable,
.sbw__pill.is-reclaim,
.sbw__pill.is-keep {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.sbw__inspector-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.sbw__inspector-title-wrap {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
}

.sbw__inspector-title {
	margin: 0;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.sbw__inspector-sub {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.sbw__inspector-actions,
.sbw__override-bar,
.sbw__member-badges,
.sbw__companion-chips {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.sbw__companion-chip {
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

.sbw__missing-note {
	padding-block: 4px;
	padding-inline: 8px;
	border-radius: 6px;
	background-color: #fdecea;
	color: #842029;
	font-size: 0.78rem;
	font-weight: 600;
}

.sbw__warn-banner {
	padding: 10px 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #f5c97b;
	background-color: #fff4e5;
	color: #7c4a03;
	font-size: 0.83rem;
	line-height: 1.45;
}

.sbw__info-banner {
	padding: 10px 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #9ec5fe;
	background-color: #e8f1fb;
	color: #0b4a8b;
	font-size: 0.83rem;
	line-height: 1.45;
}

.sbw__meta-grid {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 8px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
}

@media (min-width: 640px) {
	.sbw__meta-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

.sbw__meta-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.84rem;
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.sbw__meta-label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.sbw__mono-text {
	font-family: monospace;
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}

.sbw__member-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.sbw__member-card.is-verdict-keep-canonical-bundle,
.sbw__member-card.is-verdict-atomic-bundle-reclaim {
	border-inline-start: 4px solid #0f5132;
}

.sbw__member-card.is-verdict-hardlink-bundle-candidate {
	border-inline-start: 4px solid #0b4a8b;
}

.sbw__member-card.is-verdict-blocked-clinical-shield,
.sbw__member-card.is-verdict-blocked-assembly-ref,
.sbw__member-card.is-verdict-blocked-incomplete-anchor {
	border-inline-start: 4px solid #842029;
}

.sbw__member-card.is-verdict-blocked-manual-shield,
.sbw__member-card.is-verdict-excluded {
	border-inline-start: 4px solid #7c4a03;
}

.sbw__member-note {
	margin: 0;
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 68ch;
}

.sbw__script-box {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	padding: 8px 12px;
	background-color: var(--color-main-background);
}

.sbw__script-summary {
	display: flex;
	align-items: center;
	min-block-size: 44px;
	font-weight: 700;
	font-size: 0.86rem;
	cursor: pointer;
}

.sbw__script-content {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block-start: 8px;
}

.sbw__script-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.sbw__code-pre {
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

.sbw__load-more-wrap {
	display: flex;
	justify-content: center;
	padding-block: 6px;
}
</style>
