<template>
	<section
		class="veterinary-equine-genomics-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Veterinary Imaging, Equine Biomechanics and Livestock Genomics Vault Auditor')">
		<header class="veg__toolbar">
			<div class="veg__title-group">
				<h3 class="veg__title">
					{{ t('duplicatefinder', 'Veterinary, Equine Gait & Livestock Genomics Vault Auditor') }}
				</h3>
				<span
					class="veg__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {reg} usda-icar, {masters} pacs-gait-snp, {hold} quarantine-hold, {exports} vet-export, {scratch} pacs-scratch', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						reg: analysis.summary.totalRegulatoryPedigreeClusters,
						masters: analysis.summary.totalVetMasterClusters,
						hold: analysis.summary.totalQuarantineHoldClusters,
						exports: analysis.summary.totalRedundantExportClusters,
						scratch: analysis.summary.totalScratchClusters,
					}) }}
				</span>
			</div>

			<div class="veg__toolbar-actions">
				<button
					type="button"
					class="veg__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="veg__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="veg__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="veg__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="veg__tool-btn is-close"
					aria-keyshortcuts="Alt+Shift+V"
					:title="t('duplicatefinder', 'Hide Veterinary Imaging, Equine Biomechanics and Livestock Genomics Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Vet & Equine') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="veg__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="veg__kpis">
			<div class="veg__kpi">
				<span class="veg__kpi-label">{{ t('duplicatefinder', 'Safe Export & Scratch Reclaim') }}</span>
				<strong class="veg__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="veg__kpi">
				<span class="veg__kpi-label">{{ t('duplicatefinder', 'Conserved USDA, Masters & Holds') }}</span>
				<strong class="veg__kpi-val is-warn">
					{{ analysis.summary.totalRegulatoryPedigreeClusters }} {{ t('duplicatefinder', 'fei/icar') }} / {{ analysis.summary.totalVetMasterClusters }} {{ t('duplicatefinder', 'pacs/gait/snp') }} / {{ analysis.summary.totalQuarantineHoldClusters }} {{ t('duplicatefinder', 'aphis-hold') }}
				</strong>
			</div>
			<div class="veg__kpi">
				<span class="veg__kpi-label">{{ t('duplicatefinder', 'Derived Exports & PACS Scratch') }}</span>
				<strong class="veg__kpi-val is-danger">
					{{ analysis.summary.totalRedundantExportClusters }} {{ t('duplicatefinder', 'vet-export') }} / {{ analysis.summary.totalScratchClusters }} {{ t('duplicatefinder', 'scratch') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="veg__kpi">
				<span class="veg__kpi-label">{{ t('duplicatefinder', 'Vet & Livestock Duplicate Footprint') }}</span>
				<strong class="veg__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="veg__empty-banner"
			role="note">
			<div class="veg__empty-text">
				<p class="veg__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure USDA/FEI/ICAR, Vet PACS/Gait/SNP Master, and Quarantine Hold shields before scanning') }}
				</p>
				<p class="veg__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit APHIS/WOAH quarantine holds, FEI/ICAR/ISAG pedigree baselines, Vet PACS/Ultrasound, Equine gait/IMU, Livestock BGEN/PLINK masters, and viewer scratch.') }}
				</p>
			</div>
			<button
				type="button"
				class="veg__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="veg__controls">
			<div class="veg__control-row">
				<span class="veg__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="veg__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Veterinary, Equine and Livestock vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="veg__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="veg__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="veg__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="veg__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="veg__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="veg__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="veg__seg-btn"
					:class="{ 'is-active': protectRegulatoryAndPedigreeHolds }"
					:aria-pressed="protectRegulatoryAndPedigreeHolds ? 'true' : 'false'"
					@click="protectRegulatoryAndPedigreeHolds = !protectRegulatoryAndPedigreeHolds">
					<span>{{ protectRegulatoryAndPedigreeHolds ? t('duplicatefinder', 'Shield FEI / ICAR / Pedigree: ON') : t('duplicatefinder', 'Shield FEI / ICAR / Pedigree: OFF') }}</span>
				</button>

				<button
					type="button"
					class="veg__seg-btn"
					:class="{ 'is-active': protectVetMasters }"
					:aria-pressed="protectVetMasters ? 'true' : 'false'"
					@click="protectVetMasters = !protectVetMasters">
					<span>{{ protectVetMasters ? t('duplicatefinder', 'Shield PACS / Gait / SNP: ON') : t('duplicatefinder', 'Shield PACS / Gait / SNP: OFF') }}</span>
				</button>

				<button
					type="button"
					class="veg__seg-btn"
					:class="{ 'is-active': protectQuarantineBiosecurityHolds }"
					:aria-pressed="protectQuarantineBiosecurityHolds ? 'true' : 'false'"
					@click="protectQuarantineBiosecurityHolds = !protectQuarantineBiosecurityHolds">
					<span>{{ protectQuarantineBiosecurityHolds ? t('duplicatefinder', 'Shield Quarantine Holds: ON') : t('duplicatefinder', 'Shield Quarantine Holds: OFF') }}</span>
				</button>

				<button
					type="button"
					class="veg__seg-btn"
					:class="{ 'is-active': requireVetMasterAnchorForPrune }"
					:aria-pressed="requireVetMasterAnchorForPrune ? 'true' : 'false'"
					@click="requireVetMasterAnchorForPrune = !requireVetMasterAnchorForPrune">
					<span>{{ requireVetMasterAnchorForPrune ? t('duplicatefinder', 'Require Vet / SNP Anchor: ON') : t('duplicatefinder', 'Require Vet / SNP Anchor: OFF') }}</span>
				</button>
			</div>

			<div class="veg__control-row veg__inputs-row">
				<label class="veg__field">
					<span class="veg__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="veg__input">
						<option value="prune-exports-and-vet-scratch">{{ t('duplicatefinder', 'Prune Exports & PACS/PLINK Scratch') }}</option>
						<option value="hardlink-immutable-vet-masters">{{ t('duplicatefinder', 'Hardlink Immutable PACS/Gait/BGEN (Block Mutable)') }}</option>
						<option value="quarantine-exports-and-vet-scratch">{{ t('duplicatefinder', 'Quarantine Exports & PACS/PLINK Scratch') }}</option>
					</select>
				</label>

				<label class="veg__field">
					<span class="veg__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="veg__input">
						<option value="pedigree-vet-master-first">{{ t('duplicatefinder', 'FEI/ICAR & Vet PACS/SNP masters first') }}</option>
						<option value="oldest-clinical-capture-first">{{ t('duplicatefinder', 'Oldest clinical/gait capture first') }}</option>
						<option value="newest-evaluation-run-first">{{ t('duplicatefinder', 'Newest evaluation run first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical vault path') }}</option>
					</select>
				</label>

				<label class="veg__field">
					<span class="veg__field-label">{{ t('duplicatefinder', 'Scratch Grace (d)') }}</span>
					<input
						v-model="keepRecentRunDaysInput"
						type="number"
						min="0"
						step="1"
						class="veg__input veg__num-input">
				</label>

				<label class="veg__field">
					<span class="veg__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="veg__input veg__num-input">
				</label>

				<label class="veg__field veg__field-grow">
					<span class="veg__field-label">{{ t('duplicatefinder', 'Filter Vet PACS, Equine Gait, SNP or Scratch') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="veg__input"
						:placeholder="t('duplicatefinder', 'e.g. vetdcm, equine, hoof, forceplate, bgen, plink, fei, icar, coggins, vet_pacs_tmp')">
				</label>

				<label class="veg__field">
					<span class="veg__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="veg__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Export & scratch priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="veg__control-row">
				<span class="veg__control-label">{{ t('duplicatefinder', 'Vault Family') }}</span>
				<div
					class="veg__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Veterinary, Equine and Livestock artifact family filter')">
					<button
						type="button"
						class="veg__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="veg__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="veg__control-row">
				<span class="veg__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="veg__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Veterinary, Equine and Livestock governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="veg__seg-btn"
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
			class="veg__empty-filter"
			role="note">
			<p class="veg__empty-title">
				{{ t('duplicatefinder', 'No USDA/FEI/ICAR records, biosecurity holds, Vet PACS/Gait/SNP masters, derived exports, or scratch match the active filters.') }}
			</p>
			<button
				type="button"
				class="veg__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="veg__workspace">
			<div
				class="veg__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Veterinary, Equine and Livestock Genomics vault clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="veg__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="veg__cluster-top">
						<strong class="veg__cluster-name">{{ cluster.name }}</strong>
						<span
							class="veg__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="veg__cluster-meta">
						<span
							v-if="cluster.vetToolchain"
							class="veg__tag">{{ cluster.vetToolchain }}</span>
						<span
							v-if="cluster.workflowStage"
							class="veg__tag">{{ cluster.workflowStage }}</span>
						<span class="veg__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="veg__cluster-badges">
						<span
							v-if="cluster.hasRedundantVetExport"
							class="veg__badge is-redundant">
							{{ cluster.hasVetMasterAnchor
								? t('duplicatefinder', 'Redundant Export (Master Anchor Exists)')
								: t('duplicatefinder', 'Unanchored Export (No Master Anchor)') }}
						</span>
						<span
							v-if="cluster.hasProtectedQuarantineHold"
							class="veg__badge is-keep">
							{{ t('duplicatefinder', 'Quarantine Hold Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedRegulatoryPedigree"
							class="veg__badge is-keep">
							{{ t('duplicatefinder', 'FEI / ICAR Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedVetMaster"
							class="veg__badge is-consolidate">
							{{ t('duplicatefinder', 'Vet PACS / Gait / SNP Conserved') }}
						</span>
						<span
							v-if="cluster.hasVetPacsScratch"
							class="veg__badge is-warn">
							{{ t('duplicatefinder', 'PACS / PLINK Scratch') }}
						</span>
					</div>
					<div class="veg__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="veg__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="veg__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="veg__inspector">
				<header class="veg__inspector-head">
					<div class="veg__inspector-title-wrap">
						<h4 class="veg__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="veg__inspector-sub">
							{{ selectedCluster.vetToolchain || selectedCluster.vetStem }} | {{ selectedCluster.workflowStage || selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="veg__inspector-actions">
						<button
							type="button"
							class="veg__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="veg__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="veg__lineage-grid">
					<div class="veg__lineage-item">
						<span class="veg__lineage-label">{{ t('duplicatefinder', 'Cohort Stem & Veterinary Toolchain') }}</span>
						<strong class="veg__lineage-val">{{ selectedCluster.vetToolchain ? `${selectedCluster.vetToolchain} / ` : '' }}{{ selectedCluster.vetStem }} ({{ selectedCluster.vetAnchorKey }})</strong>
					</div>
					<div class="veg__lineage-item">
						<span class="veg__lineage-label">{{ t('duplicatefinder', 'Biosecurity, Pedigree & Master Governance') }}</span>
						<strong class="veg__lineage-val">
							{{ selectedCluster.hasProtectedQuarantineHold ? t('duplicatefinder', 'USDA APHIS, WOAH, or Coggins EIA Quarantine Hold Shielded') : (selectedCluster.hasProtectedRegulatoryPedigree ? t('duplicatefinder', 'FEI Equine Passport or ICAR/ISAG Pedigree Shielded') : (selectedCluster.hasProtectedVetMaster ? t('duplicatefinder', 'Verified Vet PACS, Equine Gait, or Livestock SNP Master Shielded') : t('duplicatefinder', 'PACS/PLINK Scratch or Derived Radiology/Gait Export'))) }}
						</strong>
					</div>
					<div class="veg__lineage-item">
						<span class="veg__lineage-label">{{ t('duplicatefinder', 'Vet PACS / Gait / SNP Anchor') }}</span>
						<strong class="veg__lineage-val">
							{{ selectedCluster.hasVetMasterAnchor ? t('duplicatefinder', 'Verified Vet PACS, Equine Gait, or Livestock SNP Anchor Found') : t('duplicatefinder', 'No Veterinary or Livestock Master Anchor Detected') }}
						</strong>
					</div>
					<div class="veg__lineage-item">
						<span class="veg__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="veg__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="veg__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="veg__member-card">
						<div class="veg__member-top">
							<code class="veg__member-path">{{ member.normalized }}</code>
							<div class="veg__member-pills">
								<span
									v-if="member.isRedundantVetExportMember"
									class="veg__pill is-redundant">
									{{ t('duplicatefinder', 'REDUNDANT EXPORT (MASTER EXISTS)') }}
								</span>
								<span
									v-if="member.isScratchPath"
									class="veg__pill is-warn">
									{{ t('duplicatefinder', 'PACS / PLINK SCRATCH') }}
								</span>
								<span
									class="veg__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.vetTag"
									class="veg__pill is-consolidate">
									{{ member.vetTag }}
								</span>
								<span
									class="veg__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="veg__member-bottom">
							<div class="veg__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.vaultRole }}</span>
								<span v-if="member.redundancyReason">{{ member.redundancyReason }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="veg__member-actions">
								<button
									type="button"
									class="veg__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="(!member.isSurvivor || member.isRedundantVetExportMember) && !(member.isProtectedQuarantineHold && protectQuarantineBiosecurityHolds) && !(member.isProtectedRegulatoryPedigree && protectRegulatoryAndPedigreeHolds) && !(member.isProtectedVetMaster && protectVetMasters)"
									class="veg__override-field">
									<span class="veg__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="veg__override-select"
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

				<div class="veg__code-panels">
					<div class="veg__code-box">
						<div class="veg__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="veg__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="veg__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="veg__code-box">
						<div class="veg__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="veg__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="veg__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	VETERINARY_EQUINE_GENOMICS_PRESETS,
	auditVeterinaryEquineGenomicsVault,
	buildVeterinaryEquineGenomicsCsvReport,
	buildVeterinaryEquineGenomicsJsonManifest,
	buildVeterinaryEquineGenomicsRemediationScript,
	buildVeterinaryEquineGenomicsSyncExcludeList,
} from '../tools/veterinaryEquineGenomicsVaultAuditor'

export default {
	name: 'VeterinaryEquineGenomicsVaultWorkbench',
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
			presetId: 'all-veterinary-equine-genomics-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-exports-and-vet-scratch',
			survivorRule: 'pedigree-vet-master-first',
			protectRegulatoryAndPedigreeHolds: true,
			protectVetMasters: true,
			protectQuarantineBiosecurityHolds: true,
			requireVetMasterAnchorForPrune: true,
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
			return VETERINARY_EQUINE_GENOMICS_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'vet-export-redundant', label: this.t('duplicatefinder', 'Vet / Gait Exports') },
				{ id: 'vet-pacs-scratch', label: this.t('duplicatefinder', 'PACS / PLINK Scratch') },
				{ id: 'vet-regulatory-pedigree-protected', label: this.t('duplicatefinder', 'FEI / ICAR') },
				{ id: 'vet-imaging-gait-master-protected', label: this.t('duplicatefinder', 'PACS / Gait / SNP') },
				{ id: 'quarantine-biosecurity-hold-protected', label: this.t('duplicatefinder', 'Quarantine Hold') },
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
			return auditVeterinaryEquineGenomicsVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectRegulatoryAndPedigreeHolds: this.protectRegulatoryAndPedigreeHolds,
				protectVetMasters: this.protectVetMasters,
				protectQuarantineBiosecurityHolds: this.protectQuarantineBiosecurityHolds,
				requireVetMasterAnchorForPrune: this.requireVetMasterAnchorForPrune,
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
			return buildVeterinaryEquineGenomicsRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildVeterinaryEquineGenomicsSyncExcludeList()
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
			const preset = VETERINARY_EQUINE_GENOMICS_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectRegulatoryAndPedigreeHolds = preset.protectRegulatoryAndPedigreeHolds
			this.protectVetMasters = preset.protectVetMasters
			this.protectQuarantineBiosecurityHolds = preset.protectQuarantineBiosecurityHolds
			this.requireVetMasterAnchorForPrune = preset.requireVetMasterAnchorForPrune
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
				'vet-regulatory-pedigree-protected': this.t('duplicatefinder', 'FEI / ICAR'),
				'vet-imaging-gait-master-protected': this.t('duplicatefinder', 'PACS / Gait / SNP'),
				'quarantine-biosecurity-hold-protected': this.t('duplicatefinder', 'Quarantine Hold'),
				'vet-export-redundant': this.t('duplicatefinder', 'Redundant Export'),
				'vet-pacs-scratch': this.t('duplicatefinder', 'PACS / PLINK Scratch'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'vet-export-redundant') {
				return 'is-redundant'
			}
			if (verdict === 'vet-regulatory-pedigree-protected' || verdict === 'quarantine-biosecurity-hold-protected') {
				return 'is-keep'
			}
			if (verdict === 'vet-imaging-gait-master-protected') {
				return 'is-consolidate'
			}
			if (verdict === 'vet-pacs-scratch') {
				return 'is-reclaim'
			}
			return 'is-warn'
		},
		actionPillClass(member) {
			if (member.action === 'delete') {
				return member.isRedundantVetExportMember ? 'is-redundant' : 'is-reclaim'
			}
			if (member.action === 'hardlink') {
				return 'is-consolidate'
			}
			return member.shielded ? 'is-keep' : 'is-warn'
		},
		formatMemberActionLabel(member) {
			if (member.action === 'delete') {
				return (this.strategy === 'quarantine-exports-and-vet-scratch' && (member.isRedundantVetExport || member.isScratchPath))
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
				this.setNotice(this.t('duplicatefinder', 'Copied Veterinary or Livestock vault file path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Veterinary & Livestock remediation script to clipboard.'))
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
			const csv = buildVeterinaryEquineGenomicsCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-veterinary-equine-genomics-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Veterinary & Livestock Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildVeterinaryEquineGenomicsJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-veterinary-equine-genomics-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Veterinary & Livestock Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.veterinary-equine-genomics-vault-workbench {
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

.veg__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
	min-inline-size: 0;
}

.veg__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.veg__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.veg__status-badge {
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

.veg__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.veg__tool-btn,
.veg__seg-btn,
.veg__primary-btn,
.veg__load-more-btn,
.veg__mini-btn {
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

.veg__tool-btn.is-primary-outline,
.veg__primary-btn {
	border-color: var(--color-primary-element);
}

.veg__primary-btn {
	background-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #ffffff);
}

.veg__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.veg__tool-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.veg__tool-btn:focus-visible,
.veg__seg-btn:focus-visible,
.veg__primary-btn:focus-visible,
.veg__load-more-btn:focus-visible,
.veg__mini-btn:focus-visible,
.veg__cluster-card:focus-visible,
.veg__input:focus-visible,
.veg__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.veg__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	overflow-wrap: anywhere;
}

.veg__notice.is-error {
	border-color: var(--color-error, #b91c1c);
}

.veg__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.veg__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.veg__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.veg__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.veg__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.veg__kpi-val.is-warn {
	color: var(--color-warning, #b45309);
}

.veg__kpi-val.is-danger {
	color: var(--color-error, #b91c1c);
}

.veg__empty-banner,
.veg__empty-filter {
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

.veg__empty-text {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.veg__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
	overflow-wrap: anywhere;
}

.veg__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.veg__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.veg__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.veg__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 92px;
}

.veg__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.veg__inputs-row {
	align-items: flex-end;
}

.veg__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.veg__field-grow {
	flex: 1 1 220px;
}

.veg__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.veg__input,
.veg__override-select {
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

.veg__num-input {
	inline-size: 96px;
}

.veg__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.veg__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.veg__cluster-card {
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

.veg__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.veg__cluster-top,
.veg__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
	min-inline-size: 0;
}

.veg__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.veg__cluster-meta,
.veg__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
	min-inline-size: 0;
}

.veg__tag {
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

.veg__badge,
.veg__pill {
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

.veg__pill.is-keep,
.veg__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.veg__pill.is-redundant,
.veg__badge.is-redundant {
	border-color: var(--color-error, #b91c1c);
	color: var(--color-error, #b91c1c);
}

.veg__pill.is-consolidate,
.veg__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.veg__pill.is-warn,
.veg__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.veg__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.veg__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.veg__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.veg__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
	min-inline-size: 0;
}

.veg__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 200px;
}

.veg__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.veg__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.veg__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	min-inline-size: 0;
}

.veg__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
	min-inline-size: 0;
}

.veg__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.veg__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.veg__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.veg__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.veg__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.veg__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.veg__member-top,
.veg__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	min-inline-size: 0;
}

.veg__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.veg__member-pills,
.veg__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.veg__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.veg__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.veg__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.veg__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
	min-inline-size: 0;
}

.veg__pre {
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

.veg__sr-only {
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
	.veg__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.veg__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.veg__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@container (max-width: 560px) {
	.veg__kpis,
	.veg__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.veg__num-input {
		inline-size: 100%;
	}

	.veg__field {
		flex: 1 1 100%;
	}
}

@media (max-width: 1120px) {
	.veg__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.veg__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.veg__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.veterinary-equine-genomics-vault-workbench {
		padding: 10px;
	}

	.veg__kpis,
	.veg__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.veg__num-input {
		inline-size: 100%;
	}

	.veg__field {
		flex: 1 1 100%;
	}
}
</style>
