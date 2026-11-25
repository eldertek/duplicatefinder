const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

const slotBox = tag => ({
	render(h) {
		return h(tag, this.$slots.default)
	},
})

function loadOrbitalSpacecraftAuditor() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/orbitalSpacecraftVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadOrbitalSpacecraftVaultWorkbench(clipboardOverrides = {}) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const auditor = loadModule('src/tools/orbitalSpacecraftVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/OrbitalSpacecraftVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async () => true,
			...clipboardOverrides,
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/orbitalSpacecraftVaultAuditor': auditor,
	})
}

function buildSampleOrbitalSpacecraftDuplicates(referenceNowMs = Date.UTC(2026, 10, 25, 9, 0, 0)) {
	const oldMtime = Math.floor((referenceNowMs - 40 * 24 * 60 * 60 * 1000) / 1000)
	const recentMtime = Math.floor((referenceNowMs - 2 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 21501,
			hash: 'orbital-hash-ccsds-oem',
			files: [
				{
					id: 1,
					nodeId: 1,
					path: '/orbital_vault/00_ccsds/leo_sat7/leo_sat7_pass_20261101.oem',
					size: 96 * 1024,
					mtime: oldMtime,
				},
				{
					id: 2,
					nodeId: 2,
					path: '/orbital_vault/mirror/leo_sat7_pass_20261101.oem',
					size: 96 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21502,
			hash: 'orbital-hash-itar-conjunction-hold',
			files: [
				{
					id: 3,
					nodeId: 3,
					path: '/mission_vault/itar_hold/conjunction_hold/sat7_debris_close_approach.cdm',
					size: 140 * 1024,
					mtime: oldMtime,
				},
				{
					id: 4,
					nodeId: 4,
					path: '/mission_vault/mirror/itar_hold/sat7_debris_close_approach.cdm',
					size: 140 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21503,
			hash: 'orbital-hash-raw-cadu-master',
			files: [
				{
					id: 5,
					nodeId: 5,
					path: '/orbital_vault/00_cadu/xband/pass_0412_sband.cadu',
					size: 720 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 6,
					nodeId: 6,
					path: '/orbital_vault/nas_mirror/xband/pass_0412_sband.cadu',
					size: 720 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21504,
			hash: 'orbital-hash-payload-l0-master',
			files: [
				{
					id: 7,
					nodeId: 7,
					path: '/orbital_vault/00_l0/sar_payload/sar_strip_20261110.l0',
					size: 480 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 8,
					nodeId: 8,
					path: '/orbital_vault/transfer/sar_strip_20261110.l0',
					size: 480 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21505,
			hash: 'orbital-hash-redundant-czml-export',
			files: [
				{
					id: 9,
					nodeId: 9,
					path: '/orbital_vault/ground_tracks/pass_0412_sband_groundtrack.czml',
					size: 64 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 10,
					nodeId: 10,
					path: '/orbital_vault/quicklooks/pass_0412_sband_groundtrack.czml',
					size: 64 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21506,
			hash: 'orbital-hash-unanchored-ephem-csv',
			files: [
				{
					id: 11,
					nodeId: 11,
					path: '/orbital_vault/decoded_exports/orphan_cubesat_telemetry_decoded.csv',
					size: 28 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 12,
					nodeId: 12,
					path: '/orbital_vault/telemetry_csv/orphan_cubesat_telemetry_decoded.csv',
					size: 28 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21507,
			hash: 'orbital-hash-gmat-stk-scratch',
			files: [
				{
					id: 13,
					nodeId: 13,
					path: '/orbital_vault/orekit_scratch/pass_0412/downlink_frame.cadu.part',
					size: 384 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 14,
					nodeId: 14,
					path: '/orbital_vault/stk_cache/pass_0412/downlink_frame.cadu.part',
					size: 384 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21508,
			hash: 'orbital-hash-cwe-injection-test',
			files: [
				{
					id: 15,
					nodeId: 15,
					path: '/orbital_vault/orekit_scratch/=cmd_tle_ephem.tmp',
					size: 12 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 16,
					nodeId: 16,
					path: '/orbital_vault/yamcs_scratch/+probe_tle_ephem.tmp',
					size: 12 * 1024 * 1024,
					mtime: oldMtime,
				},
			],
		},
		{
			id: 21509,
			hash: 'non-orbital-neuro-bids',
			files: [
				{
					id: 17,
					nodeId: 17,
					path: '/neuro_vault/bids/sub-07_task-reach_ecephys.nwb',
					size: 200 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 18,
					nodeId: 18,
					path: '/neuro_vault/mirror/sub-07_task-reach_ecephys.nwb',
					size: 200 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21510,
			hash: 'non-orbital-vacation-photo',
			files: [
				{
					id: 19,
					nodeId: 19,
					path: '/photos/holiday/sunset_beach.png',
					size: 4 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 20,
					nodeId: 20,
					path: '/photos/backup/sunset_beach.png',
					size: 4 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
	]
}

describe('Cycle 215: Orbital Spaceflight, CCSDS & Satellite Telemetry Vault Auditor', () => {
	test('classifies Orbital & CCSDS families accurately and excludes non-domain files', () => {
		const {
			classifyOrbitalSpacecraftFile,
			isOrbitalSpacecraftGroup,
		} = loadOrbitalSpacecraftAuditor()

		const cadu = classifyOrbitalSpacecraftFile({ path: '/orbital_vault/00_cadu/pass_0412.cadu', size: 1024 })
		assert.equal(cadu.family, 'raw-telemetry-payload-masters')
		assert.equal(cadu.isProtectedRawTelemetryMaster, true)
		assert.equal(cadu.isMutableFile, false)

		const oem = classifyOrbitalSpacecraftFile({ path: '/orbital_vault/00_ccsds/leo_sat7.oem', size: 512 })
		assert.equal(oem.family, 'ccsds-flight-dynamics-holds')
		assert.equal(oem.isProtectedCcsdsFlightDynamics, true)
		assert.equal(oem.isMutableFile, true)

		const tle = classifyOrbitalSpacecraftFile({ path: '/orbital_vault/00_tle/active_constellation.tle', size: 512 })
		assert.equal(tle.family, 'ccsds-flight-dynamics-holds')
		assert.equal(tle.isProtectedCcsdsFlightDynamics, true)

		const iqPass = classifyOrbitalSpacecraftFile({ path: '/groundstation/sband/pass_0911_downlink.cf32', size: 2048 })
		assert.equal(iqPass.family, 'raw-telemetry-payload-masters')
		assert.equal(iqPass.isProtectedRawTelemetryMaster, true)

		const czml = classifyOrbitalSpacecraftFile({ path: '/orbital_vault/ground_tracks/pass_0412_groundtrack.czml', size: 1024 })
		assert.equal(czml.family, 'redundant-orbit-ephem-exports')
		assert.equal(czml.isRedundantOrbitalExport, true)

		const gmatTmp = classifyOrbitalSpacecraftFile({ path: '/orbital_vault/gmat_tmp/downlink_frame.cadu.part', size: 1024 })
		assert.equal(gmatTmp.family, 'gmat-stk-groundstation-scratch')
		assert.equal(gmatTmp.isScratchPath, true)

		const nonOrbitalNwb = classifyOrbitalSpacecraftFile({ path: '/neuro_vault/00_nwb/sub-07_ecephys.nwb', size: 1024 })
		assert.equal(nonOrbitalNwb.family, null)

		const nonDomainGroup = {
			id: 99,
			files: [
				{ path: '/photos/holiday/sunset_beach.png', size: 100 },
				{ path: '/photos/backup/sunset_beach.png', size: 100 },
			],
		}
		assert.equal(isOrbitalSpacecraftGroup(nonDomainGroup), false)
	})

	test('audits ITAR holds, CCSDS/TLE baselines, raw CADU/L0 masters, anchor-guarded CZML/CSV exports, and grace-window scratch', () => {
		const {
			ORBITAL_SPACECRAFT_VAULT_SCHEMA,
			auditOrbitalSpacecraftVault,
			buildOrbitalSpacecraftRemediationScript,
			buildOrbitalSpacecraftCsvReport,
			buildOrbitalSpacecraftJsonManifest,
			buildOrbitalSpacecraftSyncExcludeList,
		} = loadOrbitalSpacecraftAuditor()

		const refNow = Date.UTC(2026, 10, 25, 9, 0, 0)
		const groups = buildSampleOrbitalSpacecraftDuplicates(refNow)
		const audit = auditOrbitalSpacecraftVault(groups, {}, refNow)

		assert.equal(audit.schema, ORBITAL_SPACECRAFT_VAULT_SCHEMA)
		assert.equal(audit.summary.totalDomainGroupsCount, 8)
		assert.equal(audit.summary.totalCcsdsFlightClusters, 1)
		assert.equal(audit.summary.totalMissionHoldClusters, 1)
		assert.equal(audit.summary.totalRawTelemetryMasterClusters, 2)

		const holdCluster = audit.clusters.find(c => c.id === 21502)
		assert.equal(holdCluster.clusterVerdict, 'mission-hold-protected')
		assert.equal(holdCluster.reclaimableBytes, 0)

		const ccsdsCluster = audit.clusters.find(c => c.id === 21501)
		assert.equal(ccsdsCluster.clusterVerdict, 'ccsds-flight-protected')
		assert.equal(ccsdsCluster.reclaimableBytes, 0)

		const rawCaduCluster = audit.clusters.find(c => c.id === 21503)
		assert.equal(rawCaduCluster.clusterVerdict, 'raw-telemetry-protected')
		assert.equal(rawCaduCluster.reclaimableBytes, 0)

		const anchoredCzml = audit.clusters.find(c => c.id === 21505)
		assert.equal(anchoredCzml.hasOrbitalMasterAnchor, true)
		assert.equal(anchoredCzml.clusterVerdict, 'orbital-export-redundant')
		assert.equal(anchoredCzml.reclaimableBytes, 2 * 64 * 1024 * 1024)

		const unanchoredCsv = audit.clusters.find(c => c.id === 21506)
		assert.equal(unanchoredCsv.hasOrbitalMasterAnchor, false)
		assert.equal(unanchoredCsv.reclaimableBytes, 0)

		const scratchWithGrace = auditOrbitalSpacecraftVault(groups, { keepRecentPassDays: 7 }, refNow)
		const scratchCluster = scratchWithGrace.clusters.find(c => c.id === 21507)
		assert.equal(scratchCluster.members[0].action, 'delete')
		assert.equal(scratchCluster.members[1].shielded, true)

		const hardlinkAudit = auditOrbitalSpacecraftVault(groups, {
			strategy: 'hardlink-immutable-cadu-and-l0',
			protectRawTelemetryMasters: false,
		}, refNow)
		const hardlinkCadu = hardlinkAudit.clusters.find(c => c.id === 21503)
		assert.equal(hardlinkCadu.members[1].action, 'hardlink')

		const script = buildOrbitalSpacecraftRemediationScript(audit)
		assert.match(script, /DRY_RUN="\$\{DRY_RUN:-1\}"/)
		assert.doesNotMatch(script, /sat7_debris_close_approach\.cdm/)
		assert.doesNotMatch(script, /pass_0412_sband\.cadu'/)

		const csv = buildOrbitalSpacecraftCsvReport(audit)
		assert.match(csv, /cluster_id,cluster_name,orbital_toolchain/)
		assert.match(csv, /'=cmd_tle_ephem\.tmp/)
		const plusFormulaCsv = buildOrbitalSpacecraftCsvReport(auditOrbitalSpacecraftVault([{
			id: 21599,
			hash: 'plus-formula',
			files: [
				{ id: 91, path: '+probe_tle_ephem.cadu.tmp', size: 1024, mtime: refNow / 1000 },
				{ id: 92, path: '/orbital_vault/yamcs_scratch/+probe_tle_ephem.cadu.tmp', size: 1024, mtime: refNow / 1000 },
			],
		}], {}, refNow))
		assert.match(plusFormulaCsv, /'\+probe_tle_ephem\.cadu\.tmp/)

		const l0Cluster = audit.clusters.find(c => c.id === 21504)
		assert.equal(l0Cluster.survivorPath, '/orbital_vault/00_l0/sar_payload/sar_strip_20261110.l0')

		const json = JSON.parse(buildOrbitalSpacecraftJsonManifest(audit))
		assert.equal(json.schema, ORBITAL_SPACECRAFT_VAULT_SCHEMA)
		assert.equal(json.clusters.length, 8)

		const syncExclude = buildOrbitalSpacecraftSyncExcludeList()
		assert.match(syncExclude, /gmat_tmp\//)
		assert.match(syncExclude, /\*\.cadu\.part/)
	})

	test('mounts OrbitalSpacecraftVaultWorkbench, switches presets, filters, keeps numeric input unclamped mid-keystroke, and handles overrides', async () => {
		const copied = []
		const Workbench = loadOrbitalSpacecraftVaultWorkbench({
			copyTextSafely: async (text) => {
				copied.push(text)
				return true
			},
		})
		const sample = buildSampleOrbitalSpacecraftDuplicates()
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)

		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: sample,
					allDuplicates: sample,
				},
			}),
		}).$mount(mountNode)

		try {
			await settle()
			const rootEl = vm.$el
			assert.ok(rootEl.classList.contains('orbital-spacecraft-vault-workbench'))
			assert.equal(rootEl.querySelectorAll('.osv__cluster-card').length, 8)

			const presetButtons = Array.from(rootEl.querySelectorAll('.osv__segments button'))
			const exportsPresetBtn = presetButtons.find(b => b.textContent.includes('Redundant Exports vs Raw CADU/L0'))
			assert.ok(exportsPresetBtn)
			exportsPresetBtn.click()
			await settle()
			assert.equal(rootEl.querySelectorAll('.osv__cluster-card').length, 2)

			const allPresetBtn = presetButtons.find(b => b.textContent.includes('All Orbital & CCSDS Vaults'))
			allPresetBtn.click()
			await settle()
			assert.equal(rootEl.querySelectorAll('.osv__cluster-card').length, 8)

			const graceInput = rootEl.querySelector('input.osv__num-input')
			graceInput.value = ''
			graceInput.dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(graceInput.value, '')

			const copyScriptBtn = Array.from(rootEl.querySelectorAll('.osv__toolbar-actions button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			copyScriptBtn.click()
			await settle()
			assert.equal(copied.length, 1)
			assert.match(copied[0], /DRY_RUN=/)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue renders Orbital & CCSDS topbar button and toggles workbench on Alt+Shift+O', async () => {
		window.localStorage.clear()
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const icon = slotBox('span')
		const SearchBar = loadComponent('src/components/SearchBar.vue', {
			'vue-material-design-icons/ChevronDown': icon,
		})
		const NcAppNavigationItemStub = {
			props: ['name', 'title', 'allowCollapse', 'open', 'active'],
			render(h) {
				return h('div', { class: ['nc-nav-item', { 'is-open': Boolean(this.open) }] }, [
					h('button', {
						attrs: { type: 'button' },
						on: { click: event => this.$emit('click', event) },
					}, this.name),
					this.$slots.default,
				])
			},
		}
		const DuplicateListItem = loadComponent('src/components/DuplicateListItem.vue', {
			'@nextcloud/vue': { NcAppNavigationItem: NcAppNavigationItemStub },
			'@/tools/duplicateStats': loadModule('src/tools/duplicateStats.js'),
			'@/tools/utils': utils,
		})
		const DuplicateNavigation = loadComponent('src/components/DuplicateNavigation.vue', {
			'@nextcloud/vue': {
				NcAppNavigation: {
					render(h) {
						return h('nav', this.$scopedSlots.list ? this.$scopedSlots.list() : this.$slots.default)
					},
				},
				NcAppNavigationItem: NcAppNavigationItemStub,
				NcButton: slotBox('button'),
			},
			'./DuplicateListItem.vue': { __esModule: true, default: DuplicateListItem },
			'./SearchBar.vue': { __esModule: true, default: SearchBar },
			'vue-material-design-icons/CloseCircle': icon,
			'vue-material-design-icons/CheckCircle': icon,
			'vue-material-design-icons/Cog': icon,
			'vue-material-design-icons/Delete': icon,
			'vue-material-design-icons/HelpCircle': icon,
			'vue-material-design-icons/School': icon,
			'vue-material-design-icons/PlayCircle': icon,
			'vue-material-design-icons/FrequentlyAskedQuestions': icon,
			'vue-material-design-icons/FolderMultiple': icon,
			'vue-material-design-icons/FolderCog': icon,
			'vue-material-design-icons/Folder': icon,
			'@/tools/api': {
				fetchDuplicates: async () => ({ entities: [], pagination: { currentPage: 1, totalPages: 1 } }),
			},
			'@/tools/utils': utils,
			'@/tools/duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
			'@/tools/duplicatePreferences': loadModule('src/tools/duplicatePreferences.js'),
			'@/tools/duplicateSelectionAndExport': loadModule('src/tools/duplicateSelectionAndExport.js'),
			'@/tools/duplicateSortHelper': loadModule('src/tools/duplicateSortHelper.js'),
			'@/tools/duplicateStats': loadModule('src/tools/duplicateStats.js'),
		})
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'isScanning'],
			render(h) {
				return h('div', { class: `stub-${name}` })
			},
		})
		const statsModule = loadModule('src/tools/duplicateStats.js')
		const treemapModule = loadModule('src/tools/duplicateTreemap.js', {
			'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
			'./duplicatePathDiff': loadModule('src/tools/duplicatePathDiff.js'),
			'./duplicateStats': statsModule,
		})
		const DuplicateTreemap = loadComponent('src/components/DuplicateTreemap.vue', {
			'../tools/duplicateStats': statsModule,
			'../tools/duplicateTreemap': treemapModule,
		})
		const OrbitalSpacecraftVaultWorkbench = loadOrbitalSpacecraftVaultWorkbench()

		const App = loadComponent('src/App.vue', {
			'@nextcloud/vue': {
				NcAppContent: slotBox('main'),
				NcContent: slotBox('div'),
				NcLoadingIcon: slotBox('span'),
				NcAppSettingsDialog: slotBox('section'),
				NcAppSettingsSection: slotBox('div'),
				NcButton: slotBox('button'),
				NcModal: slotBox('div'),
			},
			'./components/DuplicateNavigation.vue': { __esModule: true, default: DuplicateNavigation },
			'./components/DuplicateDetails.vue': { __esModule: true, default: stub('duplicate-details') },
			'./components/DuplicateTreemap.vue': { __esModule: true, default: DuplicateTreemap },
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('space-reclamation-timeline') },
			'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity-inspector') },
			'./components/BatchAutoSelectWorkbench.vue': { __esModule: true, default: stub('batch-auto-select') },
			'./components/FileHygieneInspector.vue': { __esModule: true, default: stub('file-hygiene') },
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link-simulator') },
			'./components/FolderPairMatrix.vue': { __esModule: true, default: stub('folder-matrix') },
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('storage-footprint') },
			'./components/PhotoBurstTimeline.vue': { __esModule: true, default: stub('photo-bursts') },
			'./components/RecoverySafetyWorkbench.vue': { __esModule: true, default: stub('recovery-safety') },
			'./components/ArchivePayloadInspector.vue': { __esModule: true, default: stub('archive-inspector') },
			'./components/AudioTagWorkbench.vue': { __esModule: true, default: stub('audio-workbench') },
			'./components/VideoSceneWorkbench.vue': { __esModule: true, default: stub('video-workbench') },
			'./components/SidecarSweepWorkbench.vue': { __esModule: true, default: stub('sidecar-sweep') },
			'./components/RuleProfilesWorkbench.vue': { __esModule: true, default: stub('rule-profiles') },
			'./components/DocumentLineageWorkbench.vue': { __esModule: true, default: stub('document-lineage') },
			'./components/PhotoPerceptualWorkbench.vue': { __esModule: true, default: stub('photo-perceptual') },
			'./components/BrokenMediaQuarantineWorkbench.vue': { __esModule: true, default: stub('broken-media') },
			'./components/RetentionAgeWorkbench.vue': { __esModule: true, default: stub('retention-age') },
			'./components/FilenameCollisionWorkbench.vue': { __esModule: true, default: stub('filename-collision') },
			'./components/QuotaAttributionWorkbench.vue': { __esModule: true, default: stub('quota-attribution') },
			'./components/PreviewCacheWorkbench.vue': { __esModule: true, default: stub('preview-cache') },
			'./components/ShareMountAuditorWorkbench.vue': { __esModule: true, default: stub('share-mount-auditor') },
			'./components/BackupDriftWorkbench.vue': { __esModule: true, default: stub('backup-drift') },
			'./components/AutomationRulebookWorkbench.vue': { __esModule: true, default: stub('automation-rulebook') },
			'./components/MetadataConsolidationWorkbench.vue': { __esModule: true, default: stub('metadata-consolidation') },
			'./components/ForensicVerifierWorkbench.vue': { __esModule: true, default: stub('forensic-verifier') },
			'./components/InodeSafetyWorkbench.vue': { __esModule: true, default: stub('inode-safety') },
			'./components/ShadowReclaimWorkbench.vue': { __esModule: true, default: stub('shadow-reclaim') },
			'./components/JunkPairInspectorWorkbench.vue': { __esModule: true, default: stub('junk-pair') },
			'./components/MediaFidelityWorkbench.vue': { __esModule: true, default: stub('media-fidelity') },
			'./components/CdcChunkingWorkbench.vue': { __esModule: true, default: stub('cdc-chunking') },
			'./components/OpsScheduleWorkbench.vue': { __esModule: true, default: stub('ops-schedule') },
			'./components/LegalHoldWorkbench.vue': { __esModule: true, default: stub('legal-hold') },
			'./components/RansomwareCanaryWorkbench.vue': { __esModule: true, default: stub('ransomware-canary') },
			'./components/DevTreeReclaimerWorkbench.vue': { __esModule: true, default: stub('dev-tree') },
			'./components/ConflictStormWorkbench.vue': { __esModule: true, default: stub('conflict-storm') },
			'./components/VmCowReflinkWorkbench.vue': { __esModule: true, default: stub('vm-cow') },
			'./components/ScientificBundleWorkbench.vue': { __esModule: true, default: stub('scientific-bundle') },
			'./components/BrandKitAuditorWorkbench.vue': { __esModule: true, default: stub('brand-kit-auditor') },
			'./components/LogTelemetryWorkbench.vue': { __esModule: true, default: stub('log-telemetry-auditor') },
			'./components/InstallerRepoWorkbench.vue': { __esModule: true, default: stub('installer-repo-auditor') },
			'./components/WorkbookDriftWorkbench.vue': { __esModule: true, default: stub('workbook-drift-auditor') },
			'./components/MailboxArchiveWorkbench.vue': { __esModule: true, default: stub('mailbox-archive-auditor') },
			'./components/CadVaultWorkbench.vue': { __esModule: true, default: stub('cad-vault-auditor') },
			'./components/WebBuildMediaWorkbench.vue': { __esModule: true, default: stub('web-build-media-auditor') },
			'./components/LegalDocumentOcrWorkbench.vue': { __esModule: true, default: stub('legal-document-ocr-auditor') },
			'./components/BackupTakeoutWorkbench.vue': { __esModule: true, default: stub('backup-takeout-auditor') },
			'./components/DawAudioStemWorkbench.vue': { __esModule: true, default: stub('daw-audio-stem-auditor') },
			'./components/VfxRenderCacheWorkbench.vue': { __esModule: true, default: stub('vfx-render-cache-auditor') },
			'./components/ElearningScormWorkbench.vue': { __esModule: true, default: stub('elearning-scorm-auditor') },
			'./components/PhotoRawCatalogWorkbench.vue': { __esModule: true, default: stub('photo-raw-catalog-auditor') },
			'./components/VmContainerImageWorkbench.vue': { __esModule: true, default: stub('vm-container-image-auditor') },
			'./components/MlDatasetArtifactWorkbench.vue': { __esModule: true, default: stub('ml-dataset-artifact-auditor') },
			'./components/Game3dAssetVaultWorkbench.vue': { __esModule: true, default: stub('game3d-asset-vault-auditor') },
			'./components/DatabaseDumpLogWorkbench.vue': { __esModule: true, default: stub('database-dump-log-auditor') },
			'./components/DesignPublishingVaultWorkbench.vue': { __esModule: true, default: stub('design-publishing-vault-auditor') },
			'./components/ReleaseBinaryArtifactWorkbench.vue': { __esModule: true, default: stub('release-binary-artifact-auditor') },
			'./components/EmailArchiveVaultWorkbench.vue': { __esModule: true, default: stub('email-archive-vault-auditor') },
			'./components/AudioDawVaultWorkbench.vue': { __esModule: true, default: stub('audio-daw-vault-auditor') },
			'./components/GisMapArchiveWorkbench.vue': { __esModule: true, default: stub('gis-map-archive-auditor') },
			'./components/ScientificResearchVaultWorkbench.vue': { __esModule: true, default: stub('scientific-research-vault-auditor') },
			'./components/LegalContractVaultWorkbench.vue': { __esModule: true, default: stub('legal-contract-vault-auditor') },
			'./components/MedicalDicomVaultWorkbench.vue': { __esModule: true, default: stub('medical-dicom-vault-auditor') },
			'./components/AdditiveManufacturingVaultWorkbench.vue': { __esModule: true, default: stub('additive-mfg-vault-auditor') },
			'./components/GameDevPipelineVaultWorkbench.vue': { __esModule: true, default: stub('game-dev-pipeline-vault-auditor') },
			'./components/PhotoGradingVaultWorkbench.vue': { __esModule: true, default: stub('photo-grading-vault-auditor') },
			'./components/MlCheckpointVaultWorkbench.vue': { __esModule: true, default: stub('ml-checkpoint-vault-auditor') },
			'./components/VmBackupVaultWorkbench.vue': { __esModule: true, default: stub('vm-backup-vault-auditor') },
			'./components/DbSqlLogVaultWorkbench.vue': { __esModule: true, default: stub('db-sql-log-vault-auditor') },
			'./components/BroadcastNleVaultWorkbench.vue': { __esModule: true, default: stub('broadcast-nle-vault-auditor') },
			'./components/EcommercePimVaultWorkbench.vue': { __esModule: true, default: stub('ecommerce-pim-vault-auditor') },
			'./components/FinanceTaxVaultWorkbench.vue': { __esModule: true, default: stub('finance-tax-vault-auditor') },
			'./components/IotFirmwareVaultWorkbench.vue': { __esModule: true, default: stub('iot-firmware-vault-auditor') },
			'./components/MobileBuildVaultWorkbench.vue': { __esModule: true, default: stub('mobile-build-vault-auditor') },
			'./components/K8sTerraformVaultWorkbench.vue': { __esModule: true, default: stub('k8s-terraform-vault-auditor') },
			'./components/PublishingPrepressVaultWorkbench.vue': { __esModule: true, default: stub('publishing-prepress-vault-auditor') },
			'./components/GenomicsBioinformaticsVaultWorkbench.vue': { __esModule: true, default: stub('genomics-bioinformatics-vault-auditor') },
			'./components/DfirSecurityVaultWorkbench.vue': { __esModule: true, default: stub('dfir-security-vault-auditor') },
			'./components/RoboticsRosVaultWorkbench.vue': { __esModule: true, default: stub('robotics-ros-vault-auditor') },
			'./components/SemiconductorEdaVaultWorkbench.vue': { __esModule: true, default: stub('semiconductor-eda-vault-auditor') },
			'./components/AerospaceCfdVaultWorkbench.vue': { __esModule: true, default: stub('aerospace-cfd-vault-auditor') },
			'./components/BatteryBmsVaultWorkbench.vue': { __esModule: true, default: stub('battery-bms-vault-auditor') },
			'./components/ChemPharmaGmpVaultWorkbench.vue': { __esModule: true, default: stub('chem-pharma-gmp-vault-auditor') },
			'./components/DigitalGridScadaVaultWorkbench.vue': { __esModule: true, default: stub('digital-grid-scada-vault-auditor') },
			'./components/EnergySeismicVaultWorkbench.vue': { __esModule: true, default: stub('energy-seismic-vault-auditor') },
			'./components/FiberTelecomRfVaultWorkbench.vue': { __esModule: true, default: stub('fiber-telecom-rf-vault-auditor') },
			'./components/GeotechShmCivilVaultWorkbench.vue': { __esModule: true, default: stub('geotech-shm-civil-vault-auditor') },
			'./components/HydrographyMarineVaultWorkbench.vue': { __esModule: true, default: stub('hydrography-marine-vault-auditor') },
			'./components/AstronomyFitsInterferometryVaultWorkbench.vue': { __esModule: true, default: stub('astronomy-fits-interferometry-vault-auditor') },
			'./components/MeteorologyClimateVaultWorkbench.vue': { __esModule: true, default: stub('meteorology-climate-vault-auditor') },
			'./components/MaterialsMicroscopyVaultWorkbench.vue': { __esModule: true, default: stub('materials-microscopy-vault-auditor') },
			'./components/LidarPhotogrammetryVaultWorkbench.vue': { __esModule: true, default: stub('lidar-photogrammetry-vault-auditor') },
			'./components/MocapBiomechanicsVaultWorkbench.vue': { __esModule: true, default: stub('mocap-biomechanics-vault-auditor') },
			'./components/NeuroscienceElectrophysVaultWorkbench.vue': { __esModule: true, default: stub('neuroscience-electrophys-vault-auditor') },
			'./components/OrbitalSpacecraftVaultWorkbench.vue': { __esModule: true, default: OrbitalSpacecraftVaultWorkbench },
			'./components/ParticlePhysicsHepVaultWorkbench.vue': { __esModule: true, default: stub('particle-physics-hep-vault-auditor') },
			'./components/QuantumQubitPulseVaultWorkbench.vue': { __esModule: true, default: stub('quantum-qubit-pulse-vault-auditor') },
			'./components/RailwaySignalingTelemetryVaultWorkbench.vue': { __esModule: true, default: stub('railway-signaling-telemetry-vault-auditor') },
			'./components/SpeechAsrBioacousticsVaultWorkbench.vue': { __esModule: true, default: stub('speech-asr-bioacoustics-vault-auditor') },
			'./components/TrafficItsV2xVaultWorkbench.vue': { __esModule: true, default: stub('traffic-its-v2x-vault-auditor') },
			'./components/OriginFoldersSettings.vue': { __esModule: true, default: stub('origin') },
			'./components/ExcludedFoldersSettings.vue': { __esModule: true, default: stub('excluded') },
			'./components/BulkDeletionSettings.vue': { __esModule: true, default: stub('bulk') },
			'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects') },
			'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('project-dups') },
			'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('guide') },
			'./components/help/UsageExamples.vue': { __esModule: true, default: stub('examples') },
			'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
			'./components/FilterSettings.vue': { __esModule: true, default: stub('filters') },
			'@/tools/api': {
				fetchDuplicates: async type => ({
					entities: type === 'unacknowledged' ? buildSampleOrbitalSpacecraftDuplicates() : [],
					pagination: { currentPage: 1, totalPages: 1, totalItems: 8, hasMore: false },
				}),
				fetchProjects: async () => [],
			},
			'@/tools/utils': utils,
			'@/tools/keyboardShortcuts': keyboardShortcuts,
			'@/tools/reclamationHistory': loadModule('src/tools/reclamationHistory.js', {
				'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
				'./duplicateStats': statsModule,
			}),
			'vue-material-design-icons/Folder': icon,
			'vue-material-design-icons/FolderRemove': icon,
			'vue-material-design-icons/FolderMultiple': icon,
			'vue-material-design-icons/Delete': icon,
			'vue-material-design-icons/FilterOutline': icon,
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)
		try {
			await settle()
			const btn = vm.$el.querySelector('.topbar-orbital-spacecraft-vault-button')
			assert.ok(btn, 'Topbar Orbital & CCSDS button must render')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Alt+Shift+O')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'O', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.orbitalSpacecraftVaultOpen, true)
			assert.ok(vm.$el.querySelector('.orbital-spacecraft-vault-workbench'), 'OrbitalSpacecraftVaultWorkbench must open on Alt+Shift+O shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'O', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.orbitalSpacecraftVaultOpen, false)
			assert.equal(vm.$el.querySelector('.orbital-spacecraft-vault-workbench'), null, 'OrbitalSpacecraftVaultWorkbench must toggle closed on Alt+Shift+O shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Orbital Spaceflight & CCSDS Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/orbitalSpacecraftVaultAuditor.js',
			'src/components/OrbitalSpacecraftVaultWorkbench.vue',
			'tests/frontend/orbital-spacecraft-vault-auditor.test.cjs',
			'tests/Vue/OrbitalSpacecraftVaultWorkbenchTest.php',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `No U+2013/U+2014 in ${rel}`)
			if (rel.startsWith('src/')) {
				assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `No XSS sink in ${rel}`)
			}
		}
	})
})
