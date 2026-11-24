<template>
	<section
		class="aerospace-cfd-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Aerospace, CFD and Finite Element Simulation Vault Auditor')">
		<header class="acv__toolbar">
			<div class="acv__title-group">
				<h3 class="acv__title">
					{{ t('duplicatefinder', 'Aerospace, CFD & Finite Element Simulation Vault Auditor') }}
				</h3>
				<span
					class="acv__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {decks} mesh+decks, {h5} h5+ckpt, {cert} flight-cert, {raw} raw-vtk-odb, {scratch} cfd-scratch', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						decks: analysis.summary.totalGeometryDeckClusters,
						h5: analysis.summary.totalCheckpointArchiveClusters,
						cert: analysis.summary.totalFlightCertClusters,
						raw: analysis.summary.totalRedundantDumpClusters,
						scratch: analysis.summary.totalCfdScratchClusters,
					}) }}
				</span>
			</div>

			<div class="acv__toolbar-actions">
				<button
					type="button"
					class="acv__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="acv__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="acv__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="acv__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="acv__tool-btn is-close"
					aria-keyshortcuts="Alt+Shift+A"
					:title="t('duplicatefinder', 'Hide Aerospace, CFD and Finite Element Simulation Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Aerospace & CFD Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="acv__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="acv__kpis">
			<div class="acv__kpi">
				<span class="acv__kpi-label">{{ t('duplicatefinder', 'Safe Dump & Scratch Reclaim') }}</span>
				<strong class="acv__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="acv__kpi">
				<span class="acv__kpi-label">{{ t('duplicatefinder', 'Conserved Mesh, HDF5 & Cert Vaults') }}</span>
				<strong class="acv__kpi-val is-warn">
					{{ analysis.summary.totalGeometryDeckClusters }} {{ t('duplicatefinder', 'mesh/decks') }} / {{ analysis.summary.totalCheckpointArchiveClusters }} {{ t('duplicatefinder', 'h5/ckpt') }} / {{ analysis.summary.totalFlightCertClusters }} {{ t('duplicatefinder', 'cert') }}
				</strong>
			</div>
			<div class="acv__kpi">
				<span class="acv__kpi-label">{{ t('duplicatefinder', 'Redundant VTK/ODB & Solver Scratch') }}</span>
				<strong class="acv__kpi-val is-danger">
					{{ analysis.summary.totalRedundantDumpClusters }} {{ t('duplicatefinder', 'raw-dup') }} / {{ analysis.summary.totalCfdScratchClusters }} {{ t('duplicatefinder', 'scratch') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="acv__kpi">
				<span class="acv__kpi-label">{{ t('duplicatefinder', 'Raw Aerospace Duplicate Footprint') }}</span>
				<strong class="acv__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="acv__empty-banner"
			role="note">
			<div class="acv__empty-text">
				<p class="acv__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure CGNS/deck, HDF5, and flight-cert shields before scanning') }}
				</p>
				<p class="acv__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit CAD geometry & solver decks (.cgns, .cas.h5, .msh.gz, .bdf, .inp, .k, .step), compressed checkpoints (.dat.h5, .h5, .xdmf, .vtu.gz, .odb.gz, .rst.gz), raw dumps (.vtk, .vtu, .plt, .odb, .rst), and OpenFOAM/Fluent/Abaqus scratch (processor0/, fluent_tmp/, nastran_scratch/).') }}
				</p>
			</div>
			<button
				type="button"
				class="acv__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="acv__controls">
			<div class="acv__control-row">
				<span class="acv__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="acv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Aerospace, CFD and FEA vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="acv__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="acv__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="acv__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="acv__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="acv__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="acv__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="acv__seg-btn"
					:class="{ 'is-active': protectGeometryAndInputDecks }"
					:aria-pressed="protectGeometryAndInputDecks ? 'true' : 'false'"
					@click="protectGeometryAndInputDecks = !protectGeometryAndInputDecks">
					<span>{{ protectGeometryAndInputDecks ? t('duplicatefinder', 'Shield .cgns/.bdf/.inp: ON') : t('duplicatefinder', 'Shield .cgns/.bdf/.inp: OFF') }}</span>
				</button>

				<button
					type="button"
					class="acv__seg-btn"
					:class="{ 'is-active': protectCompressedCheckpoints }"
					:aria-pressed="protectCompressedCheckpoints ? 'true' : 'false'"
					@click="protectCompressedCheckpoints = !protectCompressedCheckpoints">
					<span>{{ protectCompressedCheckpoints ? t('duplicatefinder', 'Shield .h5/.dat.h5/.gz: ON') : t('duplicatefinder', 'Shield .h5/.dat.h5/.gz: OFF') }}</span>
				</button>

				<button
					type="button"
					class="acv__seg-btn"
					:class="{ 'is-active': protectConvergenceAndFlightCert }"
					:aria-pressed="protectConvergenceAndFlightCert ? 'true' : 'false'"
					@click="protectConvergenceAndFlightCert = !protectConvergenceAndFlightCert">
					<span>{{ protectConvergenceAndFlightCert ? t('duplicatefinder', 'Shield Flight-Cert/.f06: ON') : t('duplicatefinder', 'Shield Flight-Cert/.f06: OFF') }}</span>
				</button>

				<button
					type="button"
					class="acv__seg-btn"
					:class="{ 'is-active': requireCompressedAnchorForPrune }"
					:aria-pressed="requireCompressedAnchorForPrune ? 'true' : 'false'"
					@click="requireCompressedAnchorForPrune = !requireCompressedAnchorForPrune">
					<span>{{ requireCompressedAnchorForPrune ? t('duplicatefinder', 'Require .h5/.gz Anchor: ON') : t('duplicatefinder', 'Require .h5/.gz Anchor: OFF') }}</span>
				</button>
			</div>

			<div class="acv__control-row acv__inputs-row">
				<label class="acv__field">
					<span class="acv__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="acv__input">
						<option value="prune-uncompressed-dumps-and-cfd-scratch">{{ t('duplicatefinder', 'Prune Redundant .vtk/.odb/.dat & Scratch') }}</option>
						<option value="hardlink-immutable-meshes-and-hdf5">{{ t('duplicatefinder', 'Hardlink Immutable .h5/.gz (Block Mutable)') }}</option>
						<option value="quarantine-uncompressed-dumps-and-scratch">{{ t('duplicatefinder', 'Quarantine Raw Dumps & Scratch') }}</option>
					</select>
				</label>

				<label class="acv__field">
					<span class="acv__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="acv__input">
						<option value="archive-vault-h5-first">{{ t('duplicatefinder', 'Flight-Cert, Decks & HDF5 first') }}</option>
						<option value="oldest-solver-run-first">{{ t('duplicatefinder', 'Oldest solver run mtime first') }}</option>
						<option value="newest-mesh-revision-first">{{ t('duplicatefinder', 'Newest mesh revision first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical vault path') }}</option>
					</select>
				</label>

				<label class="acv__field">
					<span class="acv__field-label">{{ t('duplicatefinder', 'Run Grace (d)') }}</span>
					<input
						v-model="keepRecentSolverRunDaysInput"
						type="number"
						min="0"
						step="1"
						class="acv__input acv__num-input">
				</label>

				<label class="acv__field">
					<span class="acv__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="acv__input acv__num-input">
				</label>

				<label class="acv__field acv__field-grow">
					<span class="acv__field-label">{{ t('duplicatefinder', 'Filter Airframe Case, Solver Toolchain, Format or Scratch Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="acv__input"
						:placeholder="t('duplicatefinder', 'e.g. cgns, bdf, dat.h5, odb, vtu, openfoam, fluent, processor0')">
				</label>

				<label class="acv__field">
					<span class="acv__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="acv__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Raw dump & scratch priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="acv__control-row">
				<span class="acv__control-label">{{ t('duplicatefinder', 'Aero Family') }}</span>
				<div
					class="acv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Aerospace, CFD and FEA artifact family filter')">
					<button
						type="button"
						class="acv__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="acv__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="acv__control-row">
				<span class="acv__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="acv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Aerospace governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="acv__seg-btn"
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
			class="acv__empty-filter"
			role="note">
			<p class="acv__empty-title">
				{{ t('duplicatefinder', 'No CAD/CGNS meshes, HDF5 checkpoints, raw VTK/ODB dumps, or CFD/FEA scratch match the active filters.') }}
			</p>
			<button
				type="button"
				class="acv__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="acv__workspace">
			<div
				class="acv__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Aerospace, CFD and FEA vault clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="acv__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="acv__cluster-top">
						<strong class="acv__cluster-name">{{ cluster.name }}</strong>
						<span
							class="acv__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="acv__cluster-meta">
						<span
							v-if="cluster.solverToolchain"
							class="acv__tag">{{ cluster.solverToolchain }}</span>
						<span
							v-if="cluster.simulationStage"
							class="acv__tag">{{ cluster.simulationStage }}</span>
						<span class="acv__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="acv__cluster-badges">
						<span
							v-if="cluster.hasRedundantUncompressedDump"
							class="acv__badge is-redundant">
							{{ cluster.hasCompressedArchiveAnchor
								? t('duplicatefinder', 'Redundant Raw Dump (.h5/.gz Anchor Exists)')
								: t('duplicatefinder', 'Uncompressed Dump (No .h5/.gz Anchor)') }}
						</span>
						<span
							v-if="cluster.hasProtectedFlightCert"
							class="acv__badge is-keep">
							{{ t('duplicatefinder', 'Flight-Cert / Validation Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedGeometryDeck"
							class="acv__badge is-keep">
							{{ t('duplicatefinder', 'CAD / Mesh / Input Deck Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedCompressedCheckpoint"
							class="acv__badge is-consolidate">
							{{ t('duplicatefinder', 'HDF5 / Compressed Checkpoint Conserved') }}
						</span>
						<span
							v-if="cluster.hasCfdScratchIntermediate"
							class="acv__badge is-warn">
							{{ t('duplicatefinder', 'OpenFOAM / Fluent / FEA Scratch') }}
						</span>
					</div>
					<div class="acv__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="acv__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="acv__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="acv__inspector">
				<header class="acv__inspector-head">
					<div class="acv__inspector-title-wrap">
						<h4 class="acv__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="acv__inspector-sub">
							{{ selectedCluster.solverToolchain || selectedCluster.caseStem }} | {{ selectedCluster.simulationStage || selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="acv__inspector-actions">
						<button
							type="button"
							class="acv__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="acv__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="acv__lineage-grid">
					<div class="acv__lineage-item">
						<span class="acv__lineage-label">{{ t('duplicatefinder', 'Case Lineage & Solver Toolchain') }}</span>
						<strong class="acv__lineage-val">{{ selectedCluster.solverToolchain ? `${selectedCluster.solverToolchain} / ` : '' }}{{ selectedCluster.caseStem }} ({{ selectedCluster.archiveAnchorKey }})</strong>
					</div>
					<div class="acv__lineage-item">
						<span class="acv__lineage-label">{{ t('duplicatefinder', 'Certification & Deck Governance') }}</span>
						<strong class="acv__lineage-val">
							{{ selectedCluster.hasProtectedFlightCert ? t('duplicatefinder', 'Flight-Certification / Wind-Tunnel Baseline Shielded') : (selectedCluster.hasProtectedGeometryDeck ? t('duplicatefinder', 'CAD Geometry, CGNS Mesh & Input Deck Shielded') : (selectedCluster.hasProtectedCompressedCheckpoint ? t('duplicatefinder', 'Compressed HDF5 / Checkpoint Archive Shielded') : t('duplicatefinder', 'Parallel Partition or Solver Scratch Artifact'))) }}
						</strong>
					</div>
					<div class="acv__lineage-item">
						<span class="acv__lineage-label">{{ t('duplicatefinder', 'Compressed .h5 / .gz Anchor') }}</span>
						<strong class="acv__lineage-val">
							{{ selectedCluster.hasCompressedArchiveAnchor ? t('duplicatefinder', 'Verified .dat.h5 / .h5 / .gz / .odb.gz Anchor Found') : t('duplicatefinder', 'No Compressed HDF5 or Gzip Anchor Detected') }}
						</strong>
					</div>
					<div class="acv__lineage-item">
						<span class="acv__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="acv__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="acv__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="acv__member-card">
						<div class="acv__member-top">
							<code class="acv__member-path">{{ member.normalized }}</code>
							<div class="acv__member-pills">
								<span
									v-if="member.isRedundantUncompressedMember"
									class="acv__pill is-redundant">
									{{ t('duplicatefinder', 'REDUNDANT DUMP (.H5/.GZ EXISTS)') }}
								</span>
								<span
									v-if="member.isCfdScratchPath"
									class="acv__pill is-warn">
									{{ t('duplicatefinder', 'CFD / FEA SCRATCH') }}
								</span>
								<span
									class="acv__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.aeroTag"
									class="acv__pill is-consolidate">
									{{ member.aeroTag }}
								</span>
								<span
									class="acv__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="acv__member-bottom">
							<div class="acv__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.vaultRole }}</span>
								<span v-if="member.redundancyReason">{{ member.redundancyReason }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="acv__member-actions">
								<button
									type="button"
									class="acv__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="(!member.isSurvivor || member.isRedundantUncompressedMember) && !(member.isProtectedFlightCert && protectConvergenceAndFlightCert) && !(member.isProtectedGeometryDeck && protectGeometryAndInputDecks) && !(member.isProtectedCompressedCheckpoint && protectCompressedCheckpoints)"
									class="acv__override-field">
									<span class="acv__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="acv__override-select"
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

				<div class="acv__code-panels">
					<div class="acv__code-box">
						<div class="acv__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="acv__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="acv__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="acv__code-box">
						<div class="acv__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="acv__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="acv__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	AEROSPACE_CFD_PRESETS,
	auditAerospaceCfdVault,
	buildAerospaceCfdCsvReport,
	buildAerospaceCfdJsonManifest,
	buildAerospaceCfdRemediationScript,
	buildAerospaceCfdSyncExcludeList,
} from '../tools/aerospaceCfdVaultAuditor'

export default {
	name: 'AerospaceCfdVaultWorkbench',
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
			presetId: 'all-aerospace-cfd-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-uncompressed-dumps-and-cfd-scratch',
			survivorRule: 'archive-vault-h5-first',
			protectGeometryAndInputDecks: true,
			protectCompressedCheckpoints: true,
			protectConvergenceAndFlightCert: true,
			requireCompressedAnchorForPrune: true,
			keepRecentSolverRunDaysInput: '0',
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
			return AEROSPACE_CFD_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'uncompressed-vtk-odb-redundant', label: this.t('duplicatefinder', 'Raw VTK / ODB / DAT') },
				{ id: 'cfd-fea-scratch-intermediate', label: this.t('duplicatefinder', 'CFD / FEA Scratch') },
				{ id: 'deck-geometry-protected', label: this.t('duplicatefinder', 'Mesh & Decks') },
				{ id: 'checkpoint-hdf5-protected', label: this.t('duplicatefinder', 'HDF5 / Checkpoints') },
				{ id: 'flight-cert-protected', label: this.t('duplicatefinder', 'Flight Cert') },
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
		parsedKeepRecentSolverRunDays() {
			const trimmed = String(this.keepRecentSolverRunDaysInput ?? '').trim()
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
			return auditAerospaceCfdVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectGeometryAndInputDecks: this.protectGeometryAndInputDecks,
				protectCompressedCheckpoints: this.protectCompressedCheckpoints,
				protectConvergenceAndFlightCert: this.protectConvergenceAndFlightCert,
				requireCompressedAnchorForPrune: this.requireCompressedAnchorForPrune,
				keepRecentSolverRunDays: this.parsedKeepRecentSolverRunDays,
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
			return buildAerospaceCfdRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildAerospaceCfdSyncExcludeList()
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
			const preset = AEROSPACE_CFD_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectGeometryAndInputDecks = preset.protectGeometryAndInputDecks
			this.protectCompressedCheckpoints = preset.protectCompressedCheckpoints
			this.protectConvergenceAndFlightCert = preset.protectConvergenceAndFlightCert
			this.requireCompressedAnchorForPrune = preset.requireCompressedAnchorForPrune
			this.keepRecentSolverRunDaysInput = String(preset.keepRecentSolverRunDays)
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
				'deck-geometry-protected': this.t('duplicatefinder', 'Mesh & Decks'),
				'checkpoint-hdf5-protected': this.t('duplicatefinder', 'HDF5 / Checkpoints'),
				'flight-cert-protected': this.t('duplicatefinder', 'Flight Cert'),
				'uncompressed-vtk-odb-redundant': this.t('duplicatefinder', 'Redundant Raw Dump'),
				'cfd-fea-scratch-intermediate': this.t('duplicatefinder', 'CFD / FEA Scratch'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'uncompressed-vtk-odb-redundant') {
				return 'is-redundant'
			}
			if (verdict === 'deck-geometry-protected' || verdict === 'flight-cert-protected') {
				return 'is-keep'
			}
			if (verdict === 'checkpoint-hdf5-protected') {
				return 'is-consolidate'
			}
			if (verdict === 'cfd-fea-scratch-intermediate') {
				return 'is-reclaim'
			}
			return 'is-warn'
		},
		actionPillClass(member) {
			if (member.action === 'delete') {
				return member.isRedundantUncompressedMember ? 'is-redundant' : 'is-reclaim'
			}
			if (member.action === 'hardlink') {
				return 'is-consolidate'
			}
			return member.shielded ? 'is-keep' : 'is-warn'
		},
		formatMemberActionLabel(member) {
			if (member.action === 'delete') {
				return (this.strategy === 'quarantine-uncompressed-dumps-and-scratch' && (member.isUncompressedResultDump || member.isCfdScratchPath))
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
				this.setNotice(this.t('duplicatefinder', 'Copied Aerospace, CFD or FEA vault file path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Aerospace & CFD remediation script to clipboard.'))
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
			const csv = buildAerospaceCfdCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-aerospace-cfd-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Aerospace & CFD Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildAerospaceCfdJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-aerospace-cfd-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Aerospace & CFD Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.aerospace-cfd-vault-workbench {
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

.acv__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.acv__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.acv__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.acv__status-badge {
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

.acv__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.acv__tool-btn,
.acv__seg-btn,
.acv__primary-btn,
.acv__load-more-btn,
.acv__mini-btn {
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

.acv__tool-btn:hover:not(:disabled),
.acv__seg-btn:hover:not(:disabled),
.acv__load-more-btn:hover:not(:disabled),
.acv__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.acv__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.acv__tool-btn.is-primary-outline,
.acv__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.acv__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.acv__tool-btn:focus-visible,
.acv__seg-btn:focus-visible,
.acv__primary-btn:focus-visible,
.acv__load-more-btn:focus-visible,
.acv__mini-btn:focus-visible,
.acv__cluster-card:focus-visible,
.acv__input:focus-visible,
.acv__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.acv__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.acv__notice.is-success {
	background-color: var(--color-background-hover);
	border-color: var(--color-success, #2d8a4e);
}

.acv__notice.is-error {
	background-color: var(--color-background-hover);
	border-color: var(--color-error, #b91c1c);
}

.acv__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.acv__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.acv__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.acv__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.acv__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.acv__kpi-val.is-warn {
	color: var(--color-warning-text, var(--color-main-text));
}

.acv__kpi-val.is-danger {
	color: var(--color-error, #b91c1c);
}

.acv__empty-banner,
.acv__empty-filter {
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

.acv__empty-text {
	flex: 1 1 240px;
	min-inline-size: 0;
}

.acv__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.acv__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.acv__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.acv__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.acv__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 96px;
}

.acv__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.acv__inputs-row {
	align-items: flex-end;
}

.acv__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.acv__field-grow {
	flex: 1 1 180px;
}

.acv__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.acv__input,
.acv__override-select {
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

.acv__num-input {
	inline-size: 96px;
}

.acv__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.acv__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.acv__cluster-card {
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

.acv__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.acv__cluster-top,
.acv__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.acv__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.acv__cluster-meta,
.acv__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.acv__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.acv__badge,
.acv__pill {
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

.acv__pill.is-keep,
.acv__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.acv__pill.is-redundant,
.acv__badge.is-redundant {
	border-color: var(--color-error, #b91c1c);
	color: var(--color-error, #b91c1c);
}

.acv__pill.is-consolidate,
.acv__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.acv__pill.is-warn,
.acv__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.acv__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.acv__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.acv__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.acv__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.acv__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.acv__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.acv__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.acv__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.acv__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.acv__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.acv__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.acv__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.acv__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.acv__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.acv__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.acv__member-top,
.acv__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.acv__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.acv__member-pills,
.acv__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.acv__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.acv__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.acv__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.acv__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.acv__pre {
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

.acv__sr-only {
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
	.acv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.acv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.acv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.aerospace-cfd-vault-workbench {
		padding: 10px;
	}

	.acv__kpis,
	.acv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.acv__num-input {
		inline-size: 100%;
	}

	.acv__field {
		flex: 1 1 100%;
	}
}
</style>
