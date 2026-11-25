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

function loadNeuroscienceElectrophysAuditor() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/neuroscienceElectrophysVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadNeuroscienceElectrophysVaultWorkbench(clipboardOverrides = {}) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const auditor = loadModule('src/tools/neuroscienceElectrophysVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/NeuroscienceElectrophysVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async () => true,
			...clipboardOverrides,
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/neuroscienceElectrophysVaultAuditor': auditor,
	})
}

function buildSampleNeuroscienceElectrophysDuplicates(referenceNowMs = Date.UTC(2026, 10, 25, 9, 0, 0)) {
	const oldMtime = Math.floor((referenceNowMs - 40 * 24 * 60 * 60 * 1000) / 1000)
	const recentMtime = Math.floor((referenceNowMs - 2 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 21401,
			hash: 'neuro-hash-bids-montage',
			files: [
				{
					id: 1,
					nodeId: 1,
					path: '/neuro_vault/bids/sub-04/ses-01/eeg/sub-04_ses-01_task-oddball_electrodes.tsv',
					size: 18 * 1024,
					mtime: oldMtime,
				},
				{
					id: 2,
					nodeId: 2,
					path: '/neuro_vault/mirror/sub-04_ses-01_task-oddball_electrodes.tsv',
					size: 18 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21402,
			hash: 'neuro-hash-irb-clinical-eeg',
			files: [
				{
					id: 3,
					nodeId: 3,
					path: '/clinical_vault/irb_hold/clinical_eeg_hold/seeg_patient09_ictal.edf',
					size: 220 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 4,
					nodeId: 4,
					path: '/clinical_vault/mirror/irb_hold/seeg_patient09_ictal.edf',
					size: 220 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21403,
			hash: 'neuro-hash-raw-nwb-master',
			files: [
				{
					id: 5,
					nodeId: 5,
					path: '/neuro_vault/00_nwb/motor_cortex/sub-07_task-reach_ecephys.nwb',
					size: 640 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 6,
					nodeId: 6,
					path: '/neuro_vault/nas_mirror/motor_cortex/sub-07_task-reach_ecephys.nwb',
					size: 640 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21404,
			hash: 'neuro-hash-raw-meg-fif',
			files: [
				{
					id: 7,
					nodeId: 7,
					path: '/neuro_vault/00_bids/sub-11/meg/sub-11_task-auditory_meg.fif',
					size: 310 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 8,
					nodeId: 8,
					path: '/neuro_vault/transfer/sub-11_task-auditory_meg.fif',
					size: 310 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21405,
			hash: 'neuro-hash-redundant-epochs-fif',
			files: [
				{
					id: 9,
					nodeId: 9,
					path: '/neuro_vault/derivatives/sub-11/meg/sub-11_task-auditory_meg-epo.fif',
					size: 85 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 10,
					nodeId: 10,
					path: '/neuro_vault/scratch_exports/sub-11_task-auditory_meg-epo.fif',
					size: 85 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21406,
			hash: 'neuro-hash-unanchored-ica',
			files: [
				{
					id: 11,
					nodeId: 11,
					path: '/neuro_vault/derivatives/orphan_session_eeg-ica.fif',
					size: 42 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 12,
					nodeId: 12,
					path: '/neuro_vault/exports/orphan_session_eeg-ica.fif',
					size: 42 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21407,
			hash: 'neuro-hash-kilosort-scratch',
			files: [
				{
					id: 13,
					nodeId: 13,
					path: '/neuro_vault/kilosort_tmp/probe_a/temp_wh.dat',
					size: 512 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 14,
					nodeId: 14,
					path: '/neuro_vault/phy_cache/probe_a/temp_wh.dat',
					size: 512 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21408,
			hash: 'neuro-hash-cwe-injection-test',
			files: [
				{
					id: 15,
					nodeId: 15,
					path: '/neuro_vault/mne_cache/=cmd_probe_psd.tmp',
					size: 16 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 16,
					nodeId: 16,
					path: '/neuro_vault/mne_tmp/+probe_psd.tmp',
					size: 16 * 1024 * 1024,
					mtime: oldMtime,
				},
			],
		},
		{
			id: 21409,
			hash: 'non-neuro-nastran-bdf',
			files: [
				{
					id: 17,
					nodeId: 17,
					path: '/aerospace_cfd/nastran/wing_box_modal.bdf',
					size: 12 * 1024 * 1024,
					mtime: oldMtime,
				},
				{
					id: 18,
					nodeId: 18,
					path: '/aerospace_cfd/mirror/wing_box_modal.bdf',
					size: 12 * 1024 * 1024,
					mtime: recentMtime,
				},
			],
		},
		{
			id: 21410,
			hash: 'non-neuro-vacation-photo',
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

describe('Cycle 214: Neuroscience, Electrophysiology & BIDS Vault Auditor', () => {
	test('classifies Neuroscience & BIDS families accurately and excludes non-domain files including Nastran .bdf', () => {
		const {
			classifyNeuroscienceElectrophysFile,
			isNeuroscienceElectrophysGroup,
		} = loadNeuroscienceElectrophysAuditor()

		const nwb = classifyNeuroscienceElectrophysFile({ path: '/neuro_vault/00_nwb/sub-07_ecephys.nwb', size: 1024 })
		assert.equal(nwb.family, 'raw-electrophys-masters')
		assert.equal(nwb.isProtectedRawElectrophysMaster, true)
		assert.equal(nwb.isMutableFile, false)

		const biosemi = classifyNeuroscienceElectrophysFile({ path: '/neuro_vault/bids/sub-01/eeg/sub-01_task-rest_eeg.bdf', size: 1024 })
		assert.equal(biosemi.family, 'raw-electrophys-masters')
		assert.equal(biosemi.isProtectedRawElectrophysMaster, true)

		const nastranBdf = classifyNeuroscienceElectrophysFile({ path: '/aerospace_cfd/nastran/wing_box_modal.bdf', size: 1024 })
		assert.equal(nastranBdf.family, null)

		const bidsSidecar = classifyNeuroscienceElectrophysFile({ path: '/neuro_vault/bids/dataset_description.json', size: 512 })
		assert.equal(bidsSidecar.family, 'bids-montages-ethics-holds')
		assert.equal(bidsSidecar.isProtectedBidsMontage, true)
		assert.equal(bidsSidecar.isMutableFile, true)

		const montage = classifyNeuroscienceElectrophysFile({ path: '/neuro_vault/montages/biosemi64_cap.sfp', size: 512 })
		assert.equal(montage.family, 'bids-montages-ethics-holds')
		assert.equal(montage.isProtectedBidsMontage, true)

		const mneEpochs = classifyNeuroscienceElectrophysFile({ path: '/neuro_vault/derivatives/sub-11_task-auditory_meg-epo.fif', size: 1024 })
		assert.equal(mneEpochs.family, 'redundant-epochs-ica-exports')
		assert.equal(mneEpochs.isRedundantNeuroDerivative, true)

		const kilosortTmp = classifyNeuroscienceElectrophysFile({ path: '/neuro_vault/kilosort_tmp/temp_wh.dat', size: 1024 })
		assert.equal(kilosortTmp.family, 'kilosort-daq-scratch')
		assert.equal(kilosortTmp.isScratchPath, true)

		const nonDomainGroup = {
			id: 99,
			files: [
				{ path: '/photos/holiday/sunset_beach.png', size: 100 },
				{ path: '/photos/backup/sunset_beach.png', size: 100 },
			],
		}
		assert.equal(isNeuroscienceElectrophysGroup(nonDomainGroup), false)
	})

	test('audits IRB holds, BIDS montages, raw masters, anchor-guarded epochs/ICA, and grace-window scratch', () => {
		const {
			NEURO_ELECTROPHYS_VAULT_SCHEMA,
			auditNeuroscienceElectrophysVault,
			buildNeuroscienceElectrophysRemediationScript,
			buildNeuroscienceElectrophysCsvReport,
			buildNeuroscienceElectrophysJsonManifest,
			buildNeuroscienceElectrophysSyncExcludeList,
		} = loadNeuroscienceElectrophysAuditor()

		const refNow = Date.UTC(2026, 10, 25, 9, 0, 0)
		const groups = buildSampleNeuroscienceElectrophysDuplicates(refNow)
		const audit = auditNeuroscienceElectrophysVault(groups, {}, refNow)

		assert.equal(audit.schema, NEURO_ELECTROPHYS_VAULT_SCHEMA)
		assert.equal(audit.summary.totalDomainGroupsCount, 8)
		assert.equal(audit.summary.totalBidsMontageClusters, 1)
		assert.equal(audit.summary.totalIrbHoldClusters, 1)
		assert.equal(audit.summary.totalRawElectrophysMasterClusters, 2)

		const irbCluster = audit.clusters.find(c => c.id === 21402)
		assert.equal(irbCluster.clusterVerdict, 'irb-hold-protected')
		assert.equal(irbCluster.reclaimableBytes, 0)

		const bidsCluster = audit.clusters.find(c => c.id === 21401)
		assert.equal(bidsCluster.clusterVerdict, 'bids-montage-protected')
		assert.equal(bidsCluster.reclaimableBytes, 0)

		const rawNwbCluster = audit.clusters.find(c => c.id === 21403)
		assert.equal(rawNwbCluster.clusterVerdict, 'raw-electrophys-protected')
		assert.equal(rawNwbCluster.reclaimableBytes, 0)

		const anchoredEpochs = audit.clusters.find(c => c.id === 21405)
		assert.equal(anchoredEpochs.hasNeuroMasterAnchor, true)
		assert.equal(anchoredEpochs.clusterVerdict, 'neuro-derivative-redundant')
		assert.equal(anchoredEpochs.reclaimableBytes, 2 * 85 * 1024 * 1024)

		const unanchoredIca = audit.clusters.find(c => c.id === 21406)
		assert.equal(unanchoredIca.hasNeuroMasterAnchor, false)
		assert.equal(unanchoredIca.reclaimableBytes, 0)

		const scratchWithGrace = auditNeuroscienceElectrophysVault(groups, { keepRecentRecordingDays: 7 }, refNow)
		const scratchCluster = scratchWithGrace.clusters.find(c => c.id === 21407)
		assert.equal(scratchCluster.members[0].action, 'delete')
		assert.equal(scratchCluster.members[1].shielded, true)

		const hardlinkAudit = auditNeuroscienceElectrophysVault(groups, {
			strategy: 'hardlink-immutable-nwb-edf-and-ns5',
			protectRawElectrophysMasters: false,
		}, refNow)
		const hardlinkNwb = hardlinkAudit.clusters.find(c => c.id === 21403)
		assert.equal(hardlinkNwb.members[1].action, 'hardlink')

		const script = buildNeuroscienceElectrophysRemediationScript(audit)
		assert.match(script, /DRY_RUN="\$\{DRY_RUN:-1\}"/)
		assert.doesNotMatch(script, /seeg_patient09_ictal\.edf/)
		assert.doesNotMatch(script, /sub-07_task-reach_ecephys\.nwb/)

		const csv = buildNeuroscienceElectrophysCsvReport(audit)
		assert.match(csv, /cluster_id,cluster_name,neuro_toolchain/)
		assert.match(csv, /'=cmd_probe_psd\.tmp/)
		assert.match(csv, /'\+=?cmd_probe|'=cmd_probe/)
		const megCluster = audit.clusters.find(c => c.id === 21404)
		assert.equal(megCluster.survivorPath, '/neuro_vault/00_bids/sub-11/meg/sub-11_task-auditory_meg.fif')

		const json = JSON.parse(buildNeuroscienceElectrophysJsonManifest(audit))
		assert.equal(json.schema, NEURO_ELECTROPHYS_VAULT_SCHEMA)
		assert.equal(json.clusters.length, 8)

		const syncExclude = buildNeuroscienceElectrophysSyncExcludeList()
		assert.match(syncExclude, /kilosort_tmp\//)
		assert.match(syncExclude, /temp_wh\.dat/)
	})

	test('mounts NeuroscienceElectrophysVaultWorkbench, switches presets, filters, keeps numeric input unclamped mid-keystroke, and handles overrides', async () => {
		const copied = []
		const Workbench = loadNeuroscienceElectrophysVaultWorkbench({
			copyTextSafely: async (text) => {
				copied.push(text)
				return true
			},
		})
		const sample = buildSampleNeuroscienceElectrophysDuplicates()
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
			assert.ok(rootEl.classList.contains('neuroscience-electrophys-vault-workbench'))
			assert.equal(rootEl.querySelectorAll('.nev__cluster-card').length, 8)

			const presetButtons = Array.from(rootEl.querySelectorAll('.nev__segments button'))
			const epochsPresetBtn = presetButtons.find(b => b.textContent.includes('Redundant Epochs/ICA vs Raw Masters'))
			assert.ok(epochsPresetBtn)
			epochsPresetBtn.click()
			await settle()
			assert.equal(rootEl.querySelectorAll('.nev__cluster-card').length, 2)

			const allPresetBtn = presetButtons.find(b => b.textContent.includes('All Neuro & BIDS Vaults'))
			allPresetBtn.click()
			await settle()
			assert.equal(rootEl.querySelectorAll('.nev__cluster-card').length, 8)

			const graceInput = rootEl.querySelector('input.nev__num-input')
			graceInput.value = ''
			graceInput.dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(graceInput.value, '')

			const copyScriptBtn = Array.from(rootEl.querySelectorAll('.nev__toolbar-actions button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			copyScriptBtn.click()
			await settle()
			assert.equal(copied.length, 1)
			assert.match(copied[0], /DRY_RUN=/)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue renders Neuroscience & BIDS topbar button and toggles workbench on Alt+Shift+N', async () => {
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
		const NeuroscienceElectrophysVaultWorkbench = loadNeuroscienceElectrophysVaultWorkbench()

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
			'./components/NeuroscienceElectrophysVaultWorkbench.vue': { __esModule: true, default: NeuroscienceElectrophysVaultWorkbench },
			'./components/OrbitalSpacecraftVaultWorkbench.vue': { __esModule: true, default: stub('orbital-spacecraft-vault-auditor') },
			'./components/ParticlePhysicsHepVaultWorkbench.vue': { __esModule: true, default: stub('particle-physics-hep-vault-auditor') },
			'./components/QuantumQubitPulseVaultWorkbench.vue': { __esModule: true, default: stub('quantum-qubit-pulse-vault-auditor') },
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
					entities: type === 'unacknowledged' ? buildSampleNeuroscienceElectrophysDuplicates() : [],
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
			const btn = vm.$el.querySelector('.topbar-neuroscience-electrophys-vault-button')
			assert.ok(btn, 'Topbar Neuroscience & BIDS button must render')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Alt+Shift+N')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'N', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.neuroscienceElectrophysVaultOpen, true)
			assert.ok(vm.$el.querySelector('.neuroscience-electrophys-vault-workbench'), 'NeuroscienceElectrophysVaultWorkbench must open on Alt+Shift+N shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'N', altKey: true, shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.neuroscienceElectrophysVaultOpen, false)
			assert.equal(vm.$el.querySelector('.neuroscience-electrophys-vault-workbench'), null, 'NeuroscienceElectrophysVaultWorkbench must toggle closed on Alt+Shift+N shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Neuroscience & Electrophysiology Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/neuroscienceElectrophysVaultAuditor.js',
			'src/components/NeuroscienceElectrophysVaultWorkbench.vue',
			'tests/frontend/neuroscience-electrophys-vault-auditor.test.cjs',
			'tests/Vue/NeuroscienceElectrophysVaultWorkbenchTest.php',
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
