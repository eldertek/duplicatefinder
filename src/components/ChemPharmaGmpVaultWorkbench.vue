<template>
	<section
		class="chem-pharma-gmp-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Chemical Process, Chromatography, Spectroscopy and Pharma GMP Vault Auditor')">
		<header class="cpg__toolbar">
			<div class="cpg__title-group">
				<h3 class="cpg__title">
					{{ t('duplicatefinder', 'Chemical Process, Chromatography & Pharma GMP Vault Auditor') }}
				</h3>
				<span
					class="cpg__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {gmp} gmp+21cfr11, {mzml} mzml+jcamp, {oos} oos+stability, {raw} mgf+csv, {scratch} lab-scratch', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						gmp: analysis.summary.totalGmpClusters,
						mzml: analysis.summary.totalSpectraArchiveClusters,
						oos: analysis.summary.totalOosStabilityClusters,
						raw: analysis.summary.totalRedundantExportClusters,
						scratch: analysis.summary.totalInstrumentScratchClusters,
					}) }}
				</span>
			</div>

			<div class="cpg__toolbar-actions">
				<button
					type="button"
					class="cpg__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="cpg__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="cpg__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="cpg__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="cpg__tool-btn is-close"
					aria-keyshortcuts="Alt+Shift+C"
					:title="t('duplicatefinder', 'Hide Chemical Process, Chromatography, Spectroscopy and Pharma GMP Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Chem & Pharma GMP Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="cpg__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="cpg__kpis">
			<div class="cpg__kpi">
				<span class="cpg__kpi-label">{{ t('duplicatefinder', 'Safe Export & Scratch Reclaim') }}</span>
				<strong class="cpg__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="cpg__kpi">
				<span class="cpg__kpi-label">{{ t('duplicatefinder', 'Conserved GMP, mzML & OOS/Stability') }}</span>
				<strong class="cpg__kpi-val is-warn">
					{{ analysis.summary.totalGmpClusters }} {{ t('duplicatefinder', 'gmp/21cfr11') }} / {{ analysis.summary.totalSpectraArchiveClusters }} {{ t('duplicatefinder', 'mzml/jcamp') }} / {{ analysis.summary.totalOosStabilityClusters }} {{ t('duplicatefinder', 'oos/stability') }}
				</strong>
			</div>
			<div class="cpg__kpi">
				<span class="cpg__kpi-label">{{ t('duplicatefinder', 'Redundant MGF/CSV & Lab Scratch') }}</span>
				<strong class="cpg__kpi-val is-danger">
					{{ analysis.summary.totalRedundantExportClusters }} {{ t('duplicatefinder', 'peak-export') }} / {{ analysis.summary.totalInstrumentScratchClusters }} {{ t('duplicatefinder', 'scratch') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="cpg__kpi">
				<span class="cpg__kpi-label">{{ t('duplicatefinder', 'Raw Chem & Pharma Duplicate Footprint') }}</span>
				<strong class="cpg__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="cpg__empty-banner"
			role="note">
			<div class="cpg__empty-text">
				<p class="cpg__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure 21 CFR Part 11, mzML/JCAMP-DX, and OOS/stability shields before scanning') }}
				</p>
				<p class="cpg__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit GMP batch COAs & validated methods (.part11, .alcoa, .elnb, .meth, .cdxml), compressed MS/NMR/XRD masters (.mzml, .mzml.zst, .jdx, .nmredata, .xrdml, .wiff2), raw peak exports (.mgf, .ms2, .csv, .xy), and Empower/ChemStation/TopSpin scratch.') }}
				</p>
			</div>
			<button
				type="button"
				class="cpg__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="cpg__controls">
			<div class="cpg__control-row">
				<span class="cpg__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="cpg__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Chemical, Chromatography and Pharma GMP vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="cpg__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="cpg__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="cpg__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="cpg__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="cpg__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="cpg__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="cpg__seg-btn"
					:class="{ 'is-active': protectGmpAndPart11 }"
					:aria-pressed="protectGmpAndPart11 ? 'true' : 'false'"
					@click="protectGmpAndPart11 = !protectGmpAndPart11">
					<span>{{ protectGmpAndPart11 ? t('duplicatefinder', 'Shield 21 CFR 11/.meth: ON') : t('duplicatefinder', 'Shield 21 CFR 11/.meth: OFF') }}</span>
				</button>

				<button
					type="button"
					class="cpg__seg-btn"
					:class="{ 'is-active': protectCompressedSpectraAnchors }"
					:aria-pressed="protectCompressedSpectraAnchors ? 'true' : 'false'"
					@click="protectCompressedSpectraAnchors = !protectCompressedSpectraAnchors">
					<span>{{ protectCompressedSpectraAnchors ? t('duplicatefinder', 'Shield .mzml/.jdx/.nmr: ON') : t('duplicatefinder', 'Shield .mzml/.jdx/.nmr: OFF') }}</span>
				</button>

				<button
					type="button"
					class="cpg__seg-btn"
					:class="{ 'is-active': protectOosStabilityEvidence }"
					:aria-pressed="protectOosStabilityEvidence ? 'true' : 'false'"
					@click="protectOosStabilityEvidence = !protectOosStabilityEvidence">
					<span>{{ protectOosStabilityEvidence ? t('duplicatefinder', 'Shield OOS/Stability: ON') : t('duplicatefinder', 'Shield OOS/Stability: OFF') }}</span>
				</button>

				<button
					type="button"
					class="cpg__seg-btn"
					:class="{ 'is-active': requireSpectraAnchorForPrune }"
					:aria-pressed="requireSpectraAnchorForPrune ? 'true' : 'false'"
					@click="requireSpectraAnchorForPrune = !requireSpectraAnchorForPrune">
					<span>{{ requireSpectraAnchorForPrune ? t('duplicatefinder', 'Require .mzml/.jdx Anchor: ON') : t('duplicatefinder', 'Require .mzml/.jdx Anchor: OFF') }}</span>
				</button>
			</div>

			<div class="cpg__control-row cpg__inputs-row">
				<label class="cpg__field">
					<span class="cpg__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="cpg__input">
						<option value="prune-peak-exports-and-instrument-scratch">{{ t('duplicatefinder', 'Prune Redundant .mgf/.csv & Scratch') }}</option>
						<option value="hardlink-immutable-mzml-and-jdx">{{ t('duplicatefinder', 'Hardlink Immutable .mzml.zst/.jdx (Block Mutable)') }}</option>
						<option value="quarantine-peak-exports-and-scratch">{{ t('duplicatefinder', 'Quarantine Peak Exports & Scratch') }}</option>
					</select>
				</label>

				<label class="cpg__field">
					<span class="cpg__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="cpg__input">
						<option value="gmp-mzml-first">{{ t('duplicatefinder', '21 CFR 11, GMP & mzML first') }}</option>
						<option value="oldest-injection-first">{{ t('duplicatefinder', 'Oldest acquisition injection first') }}</option>
						<option value="newest-method-revision-first">{{ t('duplicatefinder', 'Newest method revision first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical vault path') }}</option>
					</select>
				</label>

				<label class="cpg__field">
					<span class="cpg__field-label">{{ t('duplicatefinder', 'Acq Grace (d)') }}</span>
					<input
						v-model="keepRecentAcqRunDaysInput"
						type="number"
						min="0"
						step="1"
						class="cpg__input cpg__num-input">
				</label>

				<label class="cpg__field">
					<span class="cpg__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="cpg__input cpg__num-input">
				</label>

				<label class="cpg__field cpg__field-grow">
					<span class="cpg__field-label">{{ t('duplicatefinder', 'Filter Assay, Instrument, Format or Scratch Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="cpg__input"
						:placeholder="t('duplicatefinder', 'e.g. mzml, jdx, mgf, xrdml, empower, chemstation, topspin, coa')">
				</label>

				<label class="cpg__field">
					<span class="cpg__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="cpg__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Peak export & scratch priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="cpg__control-row">
				<span class="cpg__control-label">{{ t('duplicatefinder', 'Lab Family') }}</span>
				<div
					class="cpg__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Chemical, Chromatography and Pharma GMP artifact family filter')">
					<button
						type="button"
						class="cpg__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="cpg__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="cpg__control-row">
				<span class="cpg__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="cpg__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Chem and Pharma GMP governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="cpg__seg-btn"
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
			class="cpg__empty-filter"
			role="note">
			<p class="cpg__empty-title">
				{{ t('duplicatefinder', 'No GMP records, mzML/JCAMP-DX masters, raw MGF/CSV exports, or instrument scratch match the active filters.') }}
			</p>
			<button
				type="button"
				class="cpg__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="cpg__workspace">
			<div
				class="cpg__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Chemical, Chromatography and Pharma GMP vault clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="cpg__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="cpg__cluster-top">
						<strong class="cpg__cluster-name">{{ cluster.name }}</strong>
						<span
							class="cpg__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="cpg__cluster-meta">
						<span
							v-if="cluster.labToolchain"
							class="cpg__tag">{{ cluster.labToolchain }}</span>
						<span
							v-if="cluster.workflowStage"
							class="cpg__tag">{{ cluster.workflowStage }}</span>
						<span class="cpg__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="cpg__cluster-badges">
						<span
							v-if="cluster.hasRedundantRawPeak"
							class="cpg__badge is-redundant">
							{{ cluster.hasCompressedSpectraAnchor
								? t('duplicatefinder', 'Redundant Peak Export (.mzml/.jdx Anchor Exists)')
								: t('duplicatefinder', 'Unanchored Peak Export (No .mzml/.jdx Anchor)') }}
						</span>
						<span
							v-if="cluster.hasProtectedOosStability"
							class="cpg__badge is-keep">
							{{ t('duplicatefinder', 'OOS / Stability Evidence Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedGmp"
							class="cpg__badge is-keep">
							{{ t('duplicatefinder', '21 CFR Part 11 / Method Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedCompressedSpectra"
							class="cpg__badge is-consolidate">
							{{ t('duplicatefinder', 'mzML / JCAMP-DX / NMR Master Conserved') }}
						</span>
						<span
							v-if="cluster.hasInstrumentScratchIntermediate"
							class="cpg__badge is-warn">
							{{ t('duplicatefinder', 'Instrument / msconvert Scratch') }}
						</span>
					</div>
					<div class="cpg__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="cpg__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="cpg__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="cpg__inspector">
				<header class="cpg__inspector-head">
					<div class="cpg__inspector-title-wrap">
						<h4 class="cpg__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="cpg__inspector-sub">
							{{ selectedCluster.labToolchain || selectedCluster.runStem }} | {{ selectedCluster.workflowStage || selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="cpg__inspector-actions">
						<button
							type="button"
							class="cpg__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="cpg__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="cpg__lineage-grid">
					<div class="cpg__lineage-item">
						<span class="cpg__lineage-label">{{ t('duplicatefinder', 'Analytical Lineage & Lab Instrument') }}</span>
						<strong class="cpg__lineage-val">{{ selectedCluster.labToolchain ? `${selectedCluster.labToolchain} / ` : '' }}{{ selectedCluster.runStem }} ({{ selectedCluster.spectraAnchorKey }})</strong>
					</div>
					<div class="cpg__lineage-item">
						<span class="cpg__lineage-label">{{ t('duplicatefinder', '21 CFR Part 11 & GMP Governance') }}</span>
						<strong class="cpg__lineage-val">
							{{ selectedCluster.hasProtectedOosStability ? t('duplicatefinder', 'OOS / ICH Stability & Batch Release Shielded') : (selectedCluster.hasProtectedGmp ? t('duplicatefinder', '21 CFR Part 11, Validated Method & COA Shielded') : (selectedCluster.hasProtectedCompressedSpectra ? t('duplicatefinder', 'Compressed mzML / JCAMP-DX / NMR Master Shielded') : t('duplicatefinder', 'Instrument Scratch or Peak Export Artifact'))) }}
						</strong>
					</div>
					<div class="cpg__lineage-item">
						<span class="cpg__lineage-label">{{ t('duplicatefinder', 'Compressed .mzml / .jdx / .nmredata Anchor') }}</span>
						<strong class="cpg__lineage-val">
							{{ selectedCluster.hasCompressedSpectraAnchor ? t('duplicatefinder', 'Verified .mzml / .mzxml / .jdx / .nmredata / .xrdml Anchor Found') : t('duplicatefinder', 'No Compressed mzML, JCAMP-DX or NMR Anchor Detected') }}
						</strong>
					</div>
					<div class="cpg__lineage-item">
						<span class="cpg__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="cpg__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="cpg__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="cpg__member-card">
						<div class="cpg__member-top">
							<code class="cpg__member-path">{{ member.normalized }}</code>
							<div class="cpg__member-pills">
								<span
									v-if="member.isRedundantRawPeakMember"
									class="cpg__pill is-redundant">
									{{ t('duplicatefinder', 'REDUNDANT EXPORT (.MZML/.JDX EXISTS)') }}
								</span>
								<span
									v-if="member.isInstrumentScratchPath"
									class="cpg__pill is-warn">
									{{ t('duplicatefinder', 'INSTRUMENT SCRATCH') }}
								</span>
								<span
									class="cpg__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.chemTag"
									class="cpg__pill is-consolidate">
									{{ member.chemTag }}
								</span>
								<span
									class="cpg__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="cpg__member-bottom">
							<div class="cpg__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.vaultRole }}</span>
								<span v-if="member.redundancyReason">{{ member.redundancyReason }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="cpg__member-actions">
								<button
									type="button"
									class="cpg__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="(!member.isSurvivor || member.isRedundantRawPeakMember) && !(member.isProtectedOosStability && protectOosStabilityEvidence) && !(member.isProtectedGmp && protectGmpAndPart11) && !(member.isProtectedCompressedSpectra && protectCompressedSpectraAnchors)"
									class="cpg__override-field">
									<span class="cpg__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="cpg__override-select"
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

				<div class="cpg__code-panels">
					<div class="cpg__code-box">
						<div class="cpg__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="cpg__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="cpg__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="cpg__code-box">
						<div class="cpg__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="cpg__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="cpg__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	CHEM_PHARMA_GMP_PRESETS,
	auditChemPharmaGmpVault,
	buildChemPharmaGmpCsvReport,
	buildChemPharmaGmpJsonManifest,
	buildChemPharmaGmpRemediationScript,
	buildChemPharmaGmpSyncExcludeList,
} from '../tools/chemPharmaGmpVaultAuditor'

export default {
	name: 'ChemPharmaGmpVaultWorkbench',
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
			presetId: 'all-chem-pharma-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-peak-exports-and-instrument-scratch',
			survivorRule: 'gmp-mzml-first',
			protectGmpAndPart11: true,
			protectCompressedSpectraAnchors: true,
			protectOosStabilityEvidence: true,
			requireSpectraAnchorForPrune: true,
			keepRecentAcqRunDaysInput: '0',
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
			return CHEM_PHARMA_GMP_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'peak-export-redundant', label: this.t('duplicatefinder', 'Raw Peak / CSV / MGF') },
				{ id: 'instrument-scratch-intermediate', label: this.t('duplicatefinder', 'Instrument Scratch') },
				{ id: 'gmp-part11-protected', label: this.t('duplicatefinder', '21 CFR Part 11 & Methods') },
				{ id: 'spectra-archive-protected', label: this.t('duplicatefinder', 'mzML / JCAMP / NMR') },
				{ id: 'oos-stability-protected', label: this.t('duplicatefinder', 'OOS / Stability / COA') },
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
		parsedKeepRecentAcqRunDays() {
			const trimmed = String(this.keepRecentAcqRunDaysInput ?? '').trim()
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
			return auditChemPharmaGmpVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectGmpAndPart11: this.protectGmpAndPart11,
				protectCompressedSpectraAnchors: this.protectCompressedSpectraAnchors,
				protectOosStabilityEvidence: this.protectOosStabilityEvidence,
				requireSpectraAnchorForPrune: this.requireSpectraAnchorForPrune,
				keepRecentAcqRunDays: this.parsedKeepRecentAcqRunDays,
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
			return buildChemPharmaGmpRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildChemPharmaGmpSyncExcludeList()
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
			const preset = CHEM_PHARMA_GMP_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectGmpAndPart11 = preset.protectGmpAndPart11
			this.protectCompressedSpectraAnchors = preset.protectCompressedSpectraAnchors
			this.protectOosStabilityEvidence = preset.protectOosStabilityEvidence
			this.requireSpectraAnchorForPrune = preset.requireSpectraAnchorForPrune
			this.keepRecentAcqRunDaysInput = String(preset.keepRecentAcqRunDays)
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
				'gmp-part11-protected': this.t('duplicatefinder', '21 CFR Part 11 & Methods'),
				'spectra-archive-protected': this.t('duplicatefinder', 'mzML / JCAMP / NMR'),
				'oos-stability-protected': this.t('duplicatefinder', 'OOS / Stability / COA'),
				'peak-export-redundant': this.t('duplicatefinder', 'Redundant Peak Export'),
				'instrument-scratch-intermediate': this.t('duplicatefinder', 'Instrument Scratch'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'peak-export-redundant') {
				return 'is-redundant'
			}
			if (verdict === 'gmp-part11-protected' || verdict === 'oos-stability-protected') {
				return 'is-keep'
			}
			if (verdict === 'spectra-archive-protected') {
				return 'is-consolidate'
			}
			if (verdict === 'instrument-scratch-intermediate') {
				return 'is-reclaim'
			}
			return 'is-warn'
		},
		actionPillClass(member) {
			if (member.action === 'delete') {
				return member.isRedundantRawPeakMember ? 'is-redundant' : 'is-reclaim'
			}
			if (member.action === 'hardlink') {
				return 'is-consolidate'
			}
			return member.shielded ? 'is-keep' : 'is-warn'
		},
		formatMemberActionLabel(member) {
			if (member.action === 'delete') {
				return (this.strategy === 'quarantine-peak-exports-and-scratch' && (member.isRawPeakExport || member.isInstrumentScratchPath))
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
				this.setNotice(this.t('duplicatefinder', 'Copied Chem or Pharma GMP vault file path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Chem & Pharma GMP remediation script to clipboard.'))
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
			const csv = buildChemPharmaGmpCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-chem-pharma-gmp-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Chem & Pharma GMP Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildChemPharmaGmpJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-chem-pharma-gmp-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Chem & Pharma GMP Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.chem-pharma-gmp-vault-workbench {
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

.cpg__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.cpg__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.cpg__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.cpg__status-badge {
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

.cpg__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.cpg__tool-btn,
.cpg__seg-btn,
.cpg__primary-btn,
.cpg__load-more-btn,
.cpg__mini-btn {
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

.cpg__tool-btn:hover:not(:disabled),
.cpg__seg-btn:hover:not(:disabled),
.cpg__load-more-btn:hover:not(:disabled),
.cpg__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.cpg__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.cpg__tool-btn.is-primary-outline,
.cpg__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.cpg__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.cpg__tool-btn:focus-visible,
.cpg__seg-btn:focus-visible,
.cpg__primary-btn:focus-visible,
.cpg__load-more-btn:focus-visible,
.cpg__mini-btn:focus-visible,
.cpg__cluster-card:focus-visible,
.cpg__input:focus-visible,
.cpg__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.cpg__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.cpg__notice.is-success {
	background-color: var(--color-background-hover);
	border-color: var(--color-success, #2d8a4e);
}

.cpg__notice.is-error {
	background-color: var(--color-background-hover);
	border-color: var(--color-error, #b91c1c);
}

.cpg__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.cpg__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.cpg__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.cpg__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.cpg__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.cpg__kpi-val.is-warn {
	color: var(--color-warning-text, var(--color-main-text));
}

.cpg__kpi-val.is-danger {
	color: var(--color-error, #b91c1c);
}

.cpg__empty-banner,
.cpg__empty-filter {
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

.cpg__empty-text {
	flex: 1 1 240px;
	min-inline-size: 0;
}

.cpg__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.cpg__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.cpg__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.cpg__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.cpg__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 96px;
}

.cpg__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.cpg__inputs-row {
	align-items: flex-end;
}

.cpg__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.cpg__field-grow {
	flex: 1 1 180px;
}

.cpg__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.cpg__input,
.cpg__override-select {
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

.cpg__num-input {
	inline-size: 96px;
}

.cpg__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.cpg__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.cpg__cluster-card {
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

.cpg__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.cpg__cluster-top,
.cpg__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.cpg__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.cpg__cluster-meta,
.cpg__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.cpg__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.cpg__badge,
.cpg__pill {
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

.cpg__pill.is-keep,
.cpg__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.cpg__pill.is-redundant,
.cpg__badge.is-redundant {
	border-color: var(--color-error, #b91c1c);
	color: var(--color-error, #b91c1c);
}

.cpg__pill.is-consolidate,
.cpg__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.cpg__pill.is-warn,
.cpg__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.cpg__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.cpg__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.cpg__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.cpg__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.cpg__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.cpg__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.cpg__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.cpg__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.cpg__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.cpg__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.cpg__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.cpg__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.cpg__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.cpg__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.cpg__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.cpg__member-top,
.cpg__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.cpg__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.cpg__member-pills,
.cpg__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.cpg__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.cpg__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.cpg__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.cpg__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.cpg__pre {
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

.cpg__sr-only {
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
	.cpg__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.cpg__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.cpg__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.chem-pharma-gmp-vault-workbench {
		padding: 10px;
	}

	.cpg__kpis,
	.cpg__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.cpg__num-input {
		inline-size: 100%;
	}

	.cpg__field {
		flex: 1 1 100%;
	}
}
</style>
