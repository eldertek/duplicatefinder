const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

/**
 * Load the pure Virtualization, VM Disk Images & Container Backup Vault auditor module.
 *
 * @return {object} Loaded module exports.
 */
function loadVmBackupVaultModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateStats': duplicateStats,
	})
	return loadModule('src/tools/vmBackupVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

/**
 * Load the VmBackupVaultWorkbench Vue component with mocked clipboard helper.
 *
 * @param {Array<string>} [copiedPayloads] Array receiving copied text strings.
 * @return {object} Loaded Vue component definition.
 */
function loadVmBackupVaultWorkbench(copiedPayloads = []) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateStats': duplicateStats,
	})
	const vmBackupVaultAuditor = loadModule('src/tools/vmBackupVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/VmBackupVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async (text) => {
				copiedPayloads.push(text)
				return true
			},
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/vmBackupVaultAuditor': vmBackupVaultAuditor,
	})
}

/**
 * Build deterministic virtualization & container backup duplicate clusters for testing.
 *
 * @param {number} [nowMs] Reference epoch milliseconds.
 * @return {Array<object>} Sample duplicate groups.
 */
function buildSampleVmBackupDuplicates(nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)) {
	const twoDaysAgo = Math.floor((nowMs - 2 * 24 * 60 * 60 * 1000) / 1000)
	const thirtyDaysAgo = Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 801,
			hash: 'hash-prod-vm-vmdk',
			acknowledged: false,
			files: [
				{
					id: 8011,
					path: '/srv/esxi-prod/prod/billing-db.vmdk',
					size: 20 * 1024 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
				{
					id: 8012,
					path: '/srv/datastore/live/billing-db.vmdk',
					size: 20 * 1024 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 802,
			hash: 'hash-parent-base-qcow2',
			acknowledged: false,
			files: [
				{
					id: 8021,
					path: '/srv/kvm/ubuntu-24-web/ubuntu-24-web.qcow2',
					size: 12 * 1024 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 8022,
					path: '/home/ops/downloads/ubuntu-24-web.qcow2',
					size: 12 * 1024 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
			],
		},
		{
			id: 803,
			hash: 'hash-active-snap-vmsn',
			acknowledged: false,
			files: [
				{
					id: 8031,
					path: '/srv/kvm/ubuntu-24-web/ubuntu-24-web.vmsn',
					size: 2 * 1024 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
				{
					id: 8032,
					path: '/srv/kvm/ubuntu-24-web/ubuntu-24-web-000001.vmdk',
					size: 2 * 1024 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 804,
			hash: 'hash-orphan-snap-sav',
			acknowledged: false,
			files: [
				{
					id: 8041,
					path: '/srv/archive/orphan-vm/legacy-erp-000001.vmdk',
					size: 4 * 1024 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 8042,
					path: '/srv/tmp/detached/legacy-erp.sav',
					size: 4 * 1024 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
			],
		},
		{
			id: 805,
			hash: 'hash-docker-save-tar',
			acknowledged: false,
			files: [
				{
					id: 8051,
					path: '/srv/container-backup/docker-save-api-v2.tar.gz',
					size: 1500 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
				{
					id: 8052,
					path: '/srv/staging/docker-save-api-v2.tar.gz',
					size: 1500 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
			],
		},
		{
			id: 806,
			hash: 'hash-installer-iso',
			acknowledged: false,
			files: [
				{
					id: 8061,
					path: '/srv/iso-vault/debian-12.8.0-amd64-netinst.iso',
					size: 650 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
				{
					id: 8062,
					path: '/home/admin/Downloads/debian-12.8.0-amd64-netinst.iso',
					size: 650 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
			],
		},
		{
			id: 807,
			hash: 'hash-golden-linked-clone-base',
			acknowledged: false,
			files: [
				{
					id: 8071,
					path: '/srv/golden-bases/win11-dev.vhdx',
					size: 18 * 1024 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 8072,
					path: '/srv/vms/win11-dev-linked-clone.vhdx',
					size: 18 * 1024 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 808,
			hash: 'hash-unrelated-photo',
			acknowledged: false,
			files: [
				{ id: 8081, path: '/home/alice/Photos/vacation.jpg', size: 5 * 1024 * 1024, mtime: twoDaysAgo },
				{ id: 8082, path: '/home/alice/Backup/vacation.jpg', size: 5 * 1024 * 1024, mtime: twoDaysAgo },
			],
		},
	]
}

describe('Cycle 188: Virtualization, VM Disk Images & Container Backup Vault Auditor', () => {
	test('classifies VM disks, snapshots (-000001.vmdk/.vmsn/.sav), docker-save exports, and ISOs while excluding non-VM files', () => {
		const {
			classifyVmBackupFile,
			extractVmStem,
			isVmBackupGroup,
		} = loadVmBackupVaultModule()

		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		assert.equal(extractVmStem('ubuntu-24-web-000001.vmdk'), 'ubuntu-24-web')
		assert.equal(extractVmStem('win11-dev-linked-clone.vhdx'), 'win11-dev')
		assert.equal(extractVmStem('legacy-erp.vmsn'), 'legacy-erp')

		assert.equal(classifyVmBackupFile({ path: '/srv/prod/app.vmdk', size: 1024 }, nowMs).family, 'vm-base-disk-images')
		assert.equal(classifyVmBackupFile({ path: '/srv/vm/app-000001.vmdk', size: 1024 }, nowMs).family, 'vm-snapshots-linked-clones')
		assert.equal(classifyVmBackupFile({ path: '/srv/vm/app.vmsn', size: 1024 }, nowMs).family, 'vm-snapshots-linked-clones')
		assert.equal(classifyVmBackupFile({ path: '/srv/vm/app.sav', size: 1024 }, nowMs).family, 'vm-snapshots-linked-clones')
		assert.equal(classifyVmBackupFile({ path: '/srv/backups/docker-save-web.tar.gz', size: 1024 }, nowMs).family, 'container-backup-exports')
		assert.equal(classifyVmBackupFile({ path: '/srv/iso/ubuntu-24.04.iso', size: 1024 }, nowMs).family, 'redundant-installer-isos')
		assert.equal(classifyVmBackupFile({ path: '/srv/docs/readme.txt', size: 1024 }, nowMs).family, null)

		const samples = buildSampleVmBackupDuplicates(nowMs)
		assert.equal(isVmBackupGroup(samples[0]), true)
		assert.equal(isVmBackupGroup(samples[7]), false)
	})

	test('strictly conserves production VM images and parent base images of active snapshots & linked clones', () => {
		const { auditVmBackupVault } = loadVmBackupVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const samples = buildSampleVmBackupDuplicates(nowMs)

		const result = auditVmBackupVault(samples, {}, nowMs)
		assert.equal(result.summary.totalClustersCount, 7)

		// Cluster 801: both copies are in prod/live -> strictly shielded, 0 B reclaimable
		const prodCluster = result.clusters.find(c => c.id === 801)
		assert.ok(prodCluster)
		assert.equal(prodCluster.clusterVerdict, 'production-vm-image')
		assert.equal(prodCluster.reclaimableBytes, 0)
		assert.ok(prodCluster.members.every(m => m.action === 'keep' && m.shielded))

		// Cluster 802: /srv/kvm/ubuntu-24-web/ubuntu-24-web.qcow2 has active snapshot in same folder -> parent-base-image shielded
		const parentCluster = result.clusters.find(c => c.id === 802)
		assert.ok(parentCluster)
		assert.equal(parentCluster.clusterVerdict, 'parent-base-image')
		assert.equal(parentCluster.hasParentBaseProtection, true)
		const kvmBase = parentCluster.members.find(m => m.normalized === '/srv/kvm/ubuntu-24-web/ubuntu-24-web.qcow2')
		assert.equal(kvmBase.governanceTier, 'parent-base-image')
		assert.equal(kvmBase.action, 'keep')
		assert.equal(kvmBase.shielded, true)

		// Cluster 807: golden base /srv/golden-bases/win11-dev.vhdx has active linked clone -> strictly conserved
		const linkedBaseCluster = result.clusters.find(c => c.id === 807)
		assert.ok(linkedBaseCluster)
		const goldenBaseMember = linkedBaseCluster.members.find(m => m.normalized === '/srv/golden-bases/win11-dev.vhdx')
		assert.equal(goldenBaseMember.governanceTier, 'parent-base-image')
		assert.equal(goldenBaseMember.action, 'keep')
		assert.equal(goldenBaseMember.shielded, true)

		// Cluster 804: orphan snapshot copies (old + detached) -> 1 survivor kept, 1 orphan target quarantined/deleted
		const orphanCluster = result.clusters.find(c => c.id === 804)
		assert.ok(orphanCluster)
		assert.equal(orphanCluster.clusterVerdict, 'orphan-snapshot-delta')
		assert.equal(orphanCluster.reclaimableTargetsCount, 1)
	})

	test('blocks hardlinks on mutable VM disks while hardlinking immutable ISOs and docker-save exports under hardlink strategy', () => {
		const { auditVmBackupVault } = loadVmBackupVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const samples = buildSampleVmBackupDuplicates(nowMs)

		const result = auditVmBackupVault(samples, {
			strategy: 'consolidate-backup-vault-hardlinks',
		}, nowMs)

		const parentCluster = result.clusters.find(c => c.id === 802)
		assert.equal(parentCluster.hardlinkTargetsCount, 0)
		assert.equal(parentCluster.deleteTargetsCount, 0)
		assert.ok(parentCluster.members.every(m => m.action === 'keep'))

		const dockerCluster = result.clusters.find(c => c.id === 805)
		assert.equal(dockerCluster.hardlinkTargetsCount, 1)

		const isoCluster = result.clusters.find(c => c.id === 806)
		assert.equal(isoCluster.hardlinkTargetsCount, 1)
	})

	test('generates DRY_RUN=1 script, CWE-1236-safe CSV, JSON manifest, and .sync-exclude.lst rules', () => {
		const {
			auditVmBackupVault,
			buildVmBackupRemediationScript,
			buildVmBackupCsvReport,
			buildVmBackupJsonManifest,
			buildVmBackupSyncExcludeList,
		} = loadVmBackupVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const samples = buildSampleVmBackupDuplicates(nowMs)

		// Inject CWE-1236 formula payload in path to test escaping
		samples[5].files[1].path = '/tmp/=cmd|\' /C calc\'!A0/debian-12.8.0-amd64-netinst.iso'

		const audit = auditVmBackupVault(samples, {}, nowMs)
		const script = buildVmBackupRemediationScript(audit)
		assert.match(script, /^#!\/usr\/bin\/env bash/m)
		assert.match(script, /DRY_RUN="\$\{DRY_RUN:-1\}"/)
		assert.match(script, /QUARANTINE_DIR=/)
		assert.equal(script.includes('/srv/esxi-prod/prod/billing-db.vmdk'), false, 'Production VM image must never appear as deletion target in script')

		const csv = buildVmBackupCsvReport(audit)
		assert.ok(csv.includes('cluster_id,cluster_name,vm_stem,family,cluster_verdict'))
		assert.ok(!csv.includes(',=cmd|'), 'CWE-1236 formula cell must be escaped')

		const json = JSON.parse(buildVmBackupJsonManifest(audit))
		assert.equal(json.schema, 'duplicatefinder.vm-backup-vault-auditor.v1')
		assert.equal(json.clusters.length, 7)

		const excludeList = buildVmBackupSyncExcludeList()
		assert.match(excludeList, /\*-00000\*\.vmdk/)
		assert.match(excludeList, /\*\.vmsn/)
		assert.match(excludeList, /\*\.sav/)
		assert.match(excludeList, /docker-save-\*\.tar\.gz/)
	})

	test('VmBackupVaultWorkbench renders KPIs, empty state, filters, lineage inspector, and copy actions safely', async () => {
		const copiedPayloads = []
		const Workbench = loadVmBackupVaultWorkbench(copiedPayloads)
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)

		// Empty state check
		const emptyMount = document.createElement('div')
		document.body.appendChild(emptyMount)
		const emptyVm = new Vue({
			render: h => h(Workbench, {
				props: { duplicates: [], allDuplicates: [] },
			}),
		}).$mount(emptyMount)
		try {
			await settle()
			assert.ok(emptyVm.$el.querySelector('.vbvw__empty-banner'))
		} finally {
			emptyVm.$destroy()
			emptyMount.remove()
		}

		// Populated state check
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: buildSampleVmBackupDuplicates(nowMs),
					allDuplicates: buildSampleVmBackupDuplicates(nowMs),
				},
			}),
		}).$mount(mountNode)
		try {
			await settle()
			assert.equal(vm.$el.querySelectorAll('.vbvw__cluster-card').length, 7)
			assert.ok(vm.$el.querySelector('.vbvw__inspector'))
			assert.ok(vm.$el.querySelector('.vbvw__lineage-grid'))

			// Click preset for docker-save exports
			const dockerPresetBtn = Array.from(vm.$el.querySelectorAll('.vbvw__seg-btn')).find(b => b.textContent.includes('Docker/OCI Backup Exports'))
			assert.ok(dockerPresetBtn)
			dockerPresetBtn.click()
			await settle()
			assert.equal(vm.$el.querySelectorAll('.vbvw__cluster-card').length, 1)

			// Copy DRY_RUN=1 script
			const copyScriptBtn = Array.from(vm.$el.querySelectorAll('.vbvw__tool-btn')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			assert.ok(copyScriptBtn)
			copyScriptBtn.click()
			await settle()
			assert.equal(copiedPayloads.length, 1)
			assert.match(copiedPayloads[0], /DRY_RUN=/)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue renders VM & Backup Vault topbar button and toggles VmBackupVaultWorkbench with F3', async () => {
		const slotBox = tag => ({
			render(h) {
				return h(tag, this.$slots.default)
			},
		})
		const VmBackupVaultWorkbench = loadVmBackupVaultWorkbench()
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const statsModule = loadModule('src/tools/duplicateStats.js')
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})

		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'isScanning'],
			render(h) {
				return h('div', { class: `stub-${name}` })
			},
		})
		const icon = slotBox('span')

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
			'./components/DuplicateNavigation.vue': { __esModule: true, default: stub('nav') },
			'./components/DuplicateDetails.vue': { __esModule: true, default: stub('details') },
			'./components/DuplicateCompareView.vue': { __esModule: true, default: stub('compare') },
			'./components/DuplicateTreemap.vue': { __esModule: true, default: stub('treemap') },
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('history') },
			'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity') },
			'./components/BatchAutoSelectWorkbench.vue': { __esModule: true, default: stub('batch') },
			'./components/FileHygieneInspector.vue': { __esModule: true, default: stub('hygiene') },
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link') },
			'./components/FolderPairMatrix.vue': { __esModule: true, default: stub('matrix') },
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('footprint') },
			'./components/PhotoBurstTimeline.vue': { __esModule: true, default: stub('burst') },
			'./components/RecoverySafetyWorkbench.vue': { __esModule: true, default: stub('recovery') },
			'./components/ArchivePayloadInspector.vue': { __esModule: true, default: stub('archive') },
			'./components/AudioTagWorkbench.vue': { __esModule: true, default: stub('audio') },
			'./components/VideoSceneWorkbench.vue': { __esModule: true, default: stub('video') },
			'./components/SidecarSweepWorkbench.vue': { __esModule: true, default: stub('sidecar') },
			'./components/RuleProfilesWorkbench.vue': { __esModule: true, default: stub('rules') },
			'./components/DocumentLineageWorkbench.vue': { __esModule: true, default: stub('lineage') },
			'./components/PhotoPerceptualWorkbench.vue': { __esModule: true, default: stub('perceptual') },
			'./components/BrokenMediaQuarantineWorkbench.vue': { __esModule: true, default: stub('quarantine') },
			'./components/RetentionAgeWorkbench.vue': { __esModule: true, default: stub('retention') },
			'./components/FilenameCollisionWorkbench.vue': { __esModule: true, default: stub('collision') },
			'./components/QuotaAttributionWorkbench.vue': { __esModule: true, default: stub('quota') },
			'./components/PreviewCacheWorkbench.vue': { __esModule: true, default: stub('preview') },
			'./components/ShareMountAuditorWorkbench.vue': { __esModule: true, default: stub('share') },
			'./components/BackupDriftWorkbench.vue': { __esModule: true, default: stub('backup') },
			'./components/AutomationRulebookWorkbench.vue': { __esModule: true, default: stub('auto') },
			'./components/MetadataConsolidationWorkbench.vue': { __esModule: true, default: stub('meta') },
			'./components/ForensicVerifierWorkbench.vue': { __esModule: true, default: stub('forensic') },
			'./components/InodeSafetyWorkbench.vue': { __esModule: true, default: stub('inode') },
			'./components/ShadowReclaimWorkbench.vue': { __esModule: true, default: stub('shadow') },
			'./components/JunkPairInspectorWorkbench.vue': { __esModule: true, default: stub('junk') },
			'./components/MediaFidelityWorkbench.vue': { __esModule: true, default: stub('fidelity') },
			'./components/CdcChunkingWorkbench.vue': { __esModule: true, default: stub('cdc') },
			'./components/OpsScheduleWorkbench.vue': { __esModule: true, default: stub('ops') },
			'./components/LegalHoldWorkbench.vue': { __esModule: true, default: stub('legal') },
			'./components/RansomwareCanaryWorkbench.vue': { __esModule: true, default: stub('canary') },
			'./components/DevTreeReclaimerWorkbench.vue': { __esModule: true, default: stub('devtree') },
			'./components/ConflictStormWorkbench.vue': { __esModule: true, default: stub('conflict') },
			'./components/VmCowReflinkWorkbench.vue': { __esModule: true, default: stub('vmcow') },
			'./components/ScientificBundleWorkbench.vue': { __esModule: true, default: stub('sci') },
			'./components/BrandKitAuditorWorkbench.vue': { __esModule: true, default: stub('brand') },
			'./components/LogTelemetryWorkbench.vue': { __esModule: true, default: stub('log') },
			'./components/InstallerRepoWorkbench.vue': { __esModule: true, default: stub('installer') },
			'./components/WorkbookDriftWorkbench.vue': { __esModule: true, default: stub('workbook') },
			'./components/MailboxArchiveWorkbench.vue': { __esModule: true, default: stub('mailbox') },
			'./components/CadVaultWorkbench.vue': { __esModule: true, default: stub('cad') },
			'./components/WebBuildMediaWorkbench.vue': { __esModule: true, default: stub('webbuild') },
			'./components/LegalDocumentOcrWorkbench.vue': { __esModule: true, default: stub('legalocr') },
			'./components/BackupTakeoutWorkbench.vue': { __esModule: true, default: stub('takeout') },
			'./components/DawAudioStemWorkbench.vue': { __esModule: true, default: stub('daw') },
			'./components/VfxRenderCacheWorkbench.vue': { __esModule: true, default: stub('vfx') },
			'./components/ElearningScormWorkbench.vue': { __esModule: true, default: stub('scorm') },
			'./components/PhotoRawCatalogWorkbench.vue': { __esModule: true, default: stub('photoraw') },
			'./components/VmContainerImageWorkbench.vue': { __esModule: true, default: stub('vmcontainer') },
			'./components/MlDatasetArtifactWorkbench.vue': { __esModule: true, default: stub('mldataset') },
			'./components/Game3dAssetVaultWorkbench.vue': { __esModule: true, default: stub('game3d') },
			'./components/DatabaseDumpLogWorkbench.vue': { __esModule: true, default: stub('dblog') },
			'./components/DesignPublishingVaultWorkbench.vue': { __esModule: true, default: stub('designpub') },
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
			'./components/VmBackupVaultWorkbench.vue': { __esModule: true, default: VmBackupVaultWorkbench },
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
					entities: type === 'unacknowledged' ? buildSampleVmBackupDuplicates() : [],
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

			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'F3', shiftKey: false }), 'toggle-vm-backup-vault-auditor')
			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'F3', ctrlKey: true }), null)
			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'F3', target: { tagName: 'INPUT' } }), null)

			const btn = vm.$el.querySelector('button.topbar-vm-backup-vault-button')
			assert.ok(btn, 'VM & Backup Vault button is rendered in topbar')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'F3')
			assert.equal(vm.$el.querySelector('.vm-backup-vault-workbench'), null)

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F3', bubbles: true, cancelable: true }))
			await settle()
			assert.ok(vm.$el.querySelector('.vm-backup-vault-workbench'), 'VmBackupVaultWorkbench must open on F3 shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F3', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.$el.querySelector('.vm-backup-vault-workbench'), null, 'VmBackupVaultWorkbench must toggle closed on F3 shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Virtualization, VM Disk Images & Container Backup Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/vmBackupVaultAuditor.js',
			'src/components/VmBackupVaultWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `No U+2013/U+2014 in ${rel}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `No XSS sink in ${rel}`)
		}
	})
})
