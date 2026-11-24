const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadVmContainerModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/vmContainerImageAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadVmContainerWorkbench(clipboardImpl) {
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const vmContainerImageAuditor = loadVmContainerModule()
	return loadComponent('src/components/VmContainerImageWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/vmContainerImageAuditor': vmContainerImageAuditor,
	})
}

function buildSampleVmContainerDuplicates() {
	const mib = 1024 * 1024
	const refSec = 1796000000
	return [
		{
			id: 9801,
			hash: 'sha256-golden-iso-ubuntu',
			size: 2048 * mib,
			acknowledged: false,
			files: [
				{
					id: 98011,
					path: '/__groupfolders/14/golden-iso-vault/ubuntu-24.04-live-server-amd64.iso',
					size: 2048 * mib,
					mtime: refSec - 15 * 86400,
				},
				{
					id: 98012,
					path: '/golden-iso-vault/mirrors/ubuntu-24.04-live-server-amd64.iso',
					size: 2048 * mib,
					mtime: refSec - 15 * 86400,
				},
				{
					id: 98013,
					path: '/alice/files/Downloads/ubuntu-24.04-live-server-amd64.iso',
					size: 2048 * mib,
					mtime: refSec - 4 * 86400,
				},
			],
		},
		{
			id: 9802,
			hash: 'sha256-active-vm-disks',
			size: 4096 * mib,
			acknowledged: false,
			files: [
				{
					id: 98021,
					path: '/Proxmox/Datastore/vm-101-disk-0.qcow2',
					size: 4096 * mib,
					mtime: refSec - 20 * 86400,
				},
				{
					id: 98022,
					path: '/Libvirt/Images/vm-101-disk-0.qcow2',
					size: 4096 * mib,
					mtime: refSec - 22 * 86400,
				},
				{
					id: 98023,
					path: '/alice/files/Downloads/vm-101-disk-0.qcow2',
					size: 4096 * mib,
					mtime: refSec - 2 * 86400,
				},
			],
		},
		{
			id: 9803,
			hash: 'sha256-checksum-sidecars',
			size: 1 * mib,
			acknowledged: false,
			files: [
				{
					id: 98031,
					path: '/Releases/Containers/docker-save-nginx-1.27.tar.sha256',
					size: 1 * mib,
					mtime: refSec - 10 * 86400,
				},
				{
					id: 98032,
					path: '/golden-iso-vault/SHA256SUMS',
					size: 1 * mib,
					mtime: refSec - 11 * 86400,
				},
				{
					id: 98033,
					path: '/Downloads/docker-save-nginx-1.27.tar.sha256',
					size: 1 * mib,
					mtime: refSec - 5 * 86400,
				},
			],
		},
		{
			id: 9804,
			hash: 'sha256-container-exports-verified',
			size: 512 * mib,
			acknowledged: false,
			files: [
				{
					id: 98041,
					path: '/Releases/Containers/docker-save-nginx-1.27.tar',
					size: 512 * mib,
					mtime: refSec - 9 * 86400,
				},
				{
					id: 98042,
					path: '/Downloads/docker-save-nginx-1.27.tar',
					size: 512 * mib,
					mtime: refSec - 6 * 86400,
				},
				{
					id: 98043,
					path: '/Staging/nginx-1.27.oci.tar',
					size: 512 * mib,
					mtime: refSec - 7 * 86400,
					sha256Verified: true,
				},
			],
		},
		{
			id: 9805,
			hash: 'sha256-orphan-unverified-exports',
			size: 640 * mib,
			acknowledged: false,
			files: [
				{
					id: 98051,
					path: '/Exports/custom-appliance-orphan.ova',
					size: 640 * mib,
					mtime: refSec - 18 * 86400,
				},
				{
					id: 98052,
					path: '/Downloads/custom-appliance-orphan.ova',
					size: 640 * mib,
					mtime: refSec - 16 * 86400,
				},
			],
		},
		{
			id: 9806,
			hash: 'sha256-vm-snapshot-deltas',
			size: 128 * mib,
			acknowledged: false,
			files: [
				{
					id: 98061,
					path: '/VMware/BuildBox/BuildBox-Snapshot1.vmsn',
					size: 128 * mib,
					mtime: refSec - 2 * 86400,
				},
				{
					id: 98062,
					path: '/VMware/BuildBox/BuildBox.vmsd',
					size: 128 * mib,
					mtime: refSec - 30 * 86400,
				},
				{
					id: 98063,
					path: '/Dev/.vagrant/machines/default/virtualbox/box.vmdk.lck',
					size: 128 * mib,
					mtime: refSec - 45 * 86400,
				},
				{
					id: 98064,
					path: '/HyperV/Lab/disk.vhdx.tmp',
					size: 128 * mib,
					mtime: refSec - 60 * 86400,
				},
				{
					id: 98065,
					path: '/Downloads/debian-12.iso.part',
					size: 128 * mib,
					mtime: refSec - 70 * 86400,
				},
			],
		},
		{
			id: 9807,
			hash: 'sha256-unrelated-assets',
			size: 2 * mib,
			acknowledged: false,
			files: [
				{ id: 98071, path: '/alice/files/Photos/alpine.jpg', size: 2 * mib, mtime: refSec - 3 * 86400 },
				{ id: 98072, path: '/Documents/StandardContract.pdf', size: 2 * mib, mtime: refSec - 4 * 86400 },
			],
		},
	]
}

describe('VM, ISO & Container Image Vault Auditor', () => {
	test('classifies all 4 VM, ISO, container export, and snapshot/cache families while ignoring unrelated files', () => {
		const mod = loadVmContainerModule()

		for (const p of [
			'/Proxmox/vm-100.qcow2',
			'/VMware/win11.vmdk',
			'/VirtualBox/arch.vdi',
			'/HyperV/server.vhdx',
			'/HyperV/legacy.vhd',
			'/Images/sdcard.img',
			'/KVM/rootfs.raw',
			'/UTM/Ubuntu.utm/Data/disk0.qcow2',
			'/UTM/Debian.utm/config.plist',
		]) {
			assert.equal(mod.classifyVmContainerArtifact(p).family, 'vm-disk-images', `Expected vm-disk-images for ${p}`)
		}

		for (const p of [
			'/golden-iso-vault/ubuntu-24.04.iso',
			'/Appliances/keycloak.ova',
			'/Appliances/keycloak.ovf',
			'/Releases/ubuntu-24.04.iso.sha256',
			'/golden-iso-vault/SHA256SUMS',
		]) {
			assert.equal(mod.classifyVmContainerArtifact(p).family, 'iso-ova-installers', `Expected iso-ova-installers for ${p}`)
		}

		for (const p of [
			'/Containers/app-v2.oci.tar',
			'/OCI/blobs/image-layer.tar',
			'/Exports/docker-save-redis-7.2.tar',
			'/Containers/postgres-16.tar.zst',
		]) {
			assert.equal(mod.classifyVmContainerArtifact(p).family, 'container-image-exports', `Expected container-image-exports for ${p}`)
		}

		for (const p of [
			'/VMware/Snap1.vmsn',
			'/VMware/Snap.vmsd',
			'/VMware/disk.vmdk.lck',
			'/Project/.vagrant/machines/default/virtualbox/box.vmdk',
			'/HyperV/disk.vhdx.tmp',
			'/Downloads/ubuntu.iso.part',
		]) {
			assert.equal(mod.classifyVmContainerArtifact(p).family, 'vm-snapshot-caches', `Expected vm-snapshot-caches for ${p}`)
		}

		assert.equal(mod.classifyVmContainerArtifact('/alice/files/Photos/alpine.jpg'), null)
		assert.equal(mod.classifyVmContainerArtifact('/Documents/StandardContract.pdf'), null)

		const stemIso = mod.parseVmContainerArtifactInfo(
			'ubuntu-24.04-live-server-amd64.iso',
			'/golden-iso-vault/ubuntu-24.04-live-server-amd64.iso'
		)
		const stemSha = mod.parseVmContainerArtifactInfo(
			'ubuntu-24.04-live-server-amd64.iso.sha256',
			'/golden-iso-vault/ubuntu-24.04-live-server-amd64.iso.sha256'
		)
		assert.equal(stemIso.imageLineageStem, stemSha.imageLineageStem)
	})

	test('protects golden-iso-vault, active VM disks, and SHA256SUMS, and blocks unverified ISO/export deletion', () => {
		const mod = loadVmContainerModule()
		const analysis = mod.analyzeVmContainerImageDuplicates(buildSampleVmContainerDuplicates(), {
			strategy: 'consolidate-golden-isos',
			staleCacheDays: 14,
			referenceTimeSec: 1796000000,
		})

		assert.equal(analysis.schema, 'duplicatefinder.vm-container-image-auditor.v1')
		assert.equal(analysis.summary.totalClustersCount, 6)
		assert.equal(analysis.summary.familyCounts['iso-ova-installers'], 3)
		assert.equal(analysis.summary.familyCounts['vm-disk-images'], 1)
		assert.equal(analysis.summary.familyCounts['container-image-exports'], 1)
		assert.equal(analysis.summary.familyCounts['vm-snapshot-caches'], 1)

		const goldenCluster = analysis.clusters.find(c => c.primaryGroupId === 9801)
		assert.ok(goldenCluster)
		assert.equal(goldenCluster.survivor.tier, 'golden-iso-vault')
		assert.equal(goldenCluster.members.find(m => m.fileId === 98012).verdict, 'blocked-golden-iso-vault')
		assert.equal(goldenCluster.members.find(m => m.fileId === 98013).verdict, 'consolidate-to-golden-vault')

		const vmCluster = analysis.clusters.find(c => c.primaryGroupId === 9802)
		assert.ok(vmCluster)
		assert.equal(vmCluster.survivor.tier, 'active-vm-disk')
		assert.equal(vmCluster.members.find(m => m.fileId === 98022).verdict, 'blocked-active-vm-disk')
		assert.equal(vmCluster.members.find(m => m.fileId === 98023).verdict, 'consolidate-to-golden-vault')

		const checksumCluster = analysis.clusters.find(c => c.primaryGroupId === 9803)
		assert.ok(checksumCluster)
		assert.equal(checksumCluster.survivor.fileId, 98032)
		assert.equal(checksumCluster.members.find(m => m.fileId === 98031).verdict, 'blocked-checksum-sidecar')
		assert.equal(checksumCluster.members.find(m => m.fileId === 98033).verdict, 'blocked-checksum-sidecar')

		const snapshotAnalysis = mod.analyzeVmContainerImageDuplicates(buildSampleVmContainerDuplicates(), {
			strategy: 'prune-vm-snapshot-deltas',
			staleCacheDays: 14,
			referenceTimeSec: 1796000000,
		})
		const snapshotCluster = snapshotAnalysis.clusters.find(c => c.primaryGroupId === 9806)
		assert.ok(snapshotCluster)
		assert.equal(snapshotCluster.members.find(m => m.fileId === 98061).verdict, 'keep-canonical-survivor')
		assert.equal(snapshotCluster.members.find(m => m.fileId === 98062).verdict, 'reclaim-vm-snapshot-delta')
		assert.equal(snapshotCluster.members.find(m => m.fileId === 98063).verdict, 'reclaim-vm-snapshot-delta')
		assert.equal(snapshotCluster.members.find(m => m.fileId === 98064).verdict, 'reclaim-vm-snapshot-delta')
		assert.equal(snapshotCluster.members.find(m => m.fileId === 98065).verdict, 'reclaim-vm-snapshot-delta')

		const containerAnalysis = mod.analyzeVmContainerImageDuplicates(buildSampleVmContainerDuplicates(), {
			strategy: 'prune-duplicate-container-tarballs',
			referenceTimeSec: 1796000000,
		})
		const verifiedContainers = containerAnalysis.clusters.find(c => c.primaryGroupId === 9804)
		assert.equal(verifiedContainers.members.find(m => m.fileId === 98042).verdict, 'reclaim-verified-container-tarball')
		assert.equal(verifiedContainers.members.find(m => m.fileId === 98043).verdict, 'reclaim-verified-container-tarball')

		const orphanOva = analysis.clusters.find(c => c.primaryGroupId === 9805)
		assert.equal(orphanOva.members.find(m => m.fileId === 98052).verdict, 'blocked-unverified-golden-image')

		const excludedChecksumAnalysis = mod.analyzeVmContainerImageDuplicates(buildSampleVmContainerDuplicates(), {
			strategy: 'prune-duplicate-container-tarballs',
			referenceTimeSec: 1796000000,
			memberOverrides: {
				98031: 'exclude',
				98032: 'exclude',
				98033: 'exclude',
			},
		})
		const nowUnverifiedContainer = excludedChecksumAnalysis.clusters.find(c => c.primaryGroupId === 9804)
		assert.equal(nowUnverifiedContainer.members.find(m => m.fileId === 98042).verdict, 'blocked-unverified-golden-image')
		assert.equal(nowUnverifiedContainer.members.find(m => m.fileId === 98043).verdict, 'reclaim-verified-container-tarball')
	})

	test('supports overrides, DRY_RUN=1 POSIX script, .sync-exclude.lst, CWE-1236 CSV, and JSON manifest', () => {
		const mod = loadVmContainerModule()
		const duplicates = [
			...buildSampleVmContainerDuplicates(),
			{
				id: 9899,
				hash: 'sha256-formula-iso',
				size: 1024 * 1024 * 100,
				acknowledged: false,
				files: [
					{ id: 98991, path: '/golden-iso-vault/=CMD("calc")_Appliance.iso', size: 104857600, mtime: 1795000000 },
					{ id: 98992, path: '/Downloads/stray_Appliance.iso', size: 104857600, mtime: 1790000000 },
				],
			},
			{
				id: 9898,
				hash: 'sha256-formula-plus-sha',
				size: 4096,
				acknowledged: false,
				files: [
					{ id: 98981, path: '/golden-iso-vault/+malicious_Appliance.iso.sha256', size: 4096, mtime: 1795000000 },
					{ id: 98982, path: '/Downloads/stray_Appliance.iso.sha256', size: 4096, mtime: 1790000000 },
				],
			},
		]

		const consolidateAnalysis = mod.analyzeVmContainerImageDuplicates(duplicates, {
			strategy: 'consolidate-golden-isos',
			referenceTimeSec: 1796000000,
		})
		const goldenCluster = consolidateAnalysis.clusters.find(c => c.primaryGroupId === 9801)
		assert.equal(goldenCluster.members.find(m => m.fileId === 98013).verdict, 'consolidate-to-golden-vault')
		assert.equal(goldenCluster.members.find(m => m.fileId === 98013).actionKind, 'consolidate')

		const script = mod.buildVmContainerImageScript(consolidateAnalysis, { dataRoot: '/srv/nc/data' })
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('sha256sum --'))
		assert.ok(script.includes('stat -c %d'))
		assert.ok(script.includes('consolidate_vault_artifact'))
		assert.ok(script.includes('occ files:scan --path='))

		const overrideAnalysis = mod.analyzeVmContainerImageDuplicates(buildSampleVmContainerDuplicates(), {
			strategy: 'prune-vm-snapshot-deltas',
			staleCacheDays: 14,
			memberOverrides: {
				98062: 'force-keep',
				98063: 'exclude',
			},
			referenceTimeSec: 1796000000,
		})
		const snapOverridden = overrideAnalysis.clusters.find(c => c.primaryGroupId === 9806)
		assert.equal(snapOverridden.members.find(m => m.fileId === 98062).verdict, 'blocked-manual-shield')
		assert.equal(snapOverridden.members.find(m => m.fileId === 98063).verdict, 'excluded')

		const syncExclude = mod.buildVmContainerImageSyncExcludeSnippet(consolidateAnalysis)
		for (const pattern of ['*.vmsn', '*.vmsd', '*.lck', '.vagrant/', '*.vhdx.tmp', '*.part']) {
			assert.ok(syncExclude.includes(pattern), `Expected .sync-exclude.lst pattern ${pattern}`)
		}

		const csv = mod.buildVmContainerImageCsvReport(consolidateAnalysis)
		assert.ok(csv.includes('"\'=CMD(""calc"")_Appliance.iso"') || csv.includes("'=CMD"))
		assert.ok(csv.includes("'+malicious_Appliance.iso.sha256"))

		const json = JSON.parse(mod.buildVmContainerImageJsonReport(consolidateAnalysis, '2026-11-24T07:25:00Z'))
		assert.equal(json.schema, 'duplicatefinder.vm-container-image-auditor.v1')
		assert.equal(json.generatedAt, '2026-11-24T07:25:00Z')
		assert.ok(Array.isArray(json.clusters))
	})

	test('renders VmContainerImageWorkbench empty, filter-empty, populated, and interactive states without clamping numeric inputs', async () => {
		let copied = ''
		const Workbench = loadVmContainerWorkbench({
			writeText: async text => {
				copied = text
			},
		})

		const emptyVm = new Vue({
			render: h => h(Workbench, {
				props: { duplicates: [], allDuplicates: [] },
			}),
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.querySelector('.vciw__empty-banner'))
		emptyVm.$destroy()

		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: buildSampleVmContainerDuplicates(),
					allDuplicates: buildSampleVmContainerDuplicates(),
					currentDuplicateId: 9801,
				},
			}),
		}).$mount()
		await settle()

		assert.equal(vm.$el.querySelectorAll('.vciw__cluster-item').length, 6)
		assert.ok(vm.$el.textContent.includes('ubuntu-24.04-live-server-amd64.iso'))

		const numInputs = vm.$el.querySelectorAll('.vciw__num-input')
		assert.equal(numInputs.length, 3)
		for (const input of numInputs) {
			input.value = ''
			input.dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(input.value, '', 'Numeric input must not clamp or reset mid-keystroke')
		}

		const copyBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
		copyBtn.click()
		await settle()
		assert.ok(copied.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(vm.$el.querySelector('.vciw__notice.is-success'))

		const searchInput = vm.$el.querySelector('input[type="search"]')
		searchInput.value = 'no-such-vm-iso-vault-xyz'
		searchInput.dispatchEvent(new window.Event('input'))
		await settle()
		assert.ok(vm.$el.querySelector('.vciw__empty-banner'))

		const resetBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Reset Filters'))
		resetBtn.click()
		await settle()
		assert.equal(vm.$el.querySelectorAll('.vciw__cluster-item').length, 6)

		vm.$destroy()
	})

	test('integrates VM & ISO Vault button and Shift+I keyboard shortcut in App.vue', async () => {
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const duplicateFilters = loadModule('src/tools/duplicateFilters.js')
		const duplicateStats = loadModule('src/tools/duplicateStats.js')
		const reclamationHistory = loadModule('src/tools/reclamationHistory.js', {
			'./duplicateFilters': duplicateFilters,
			'./duplicateStats': duplicateStats,
		})
		const VmContainerWorkbench = loadVmContainerWorkbench({ writeText: async () => {} })

		const slotBox = tag => ({
			render(h) {
				return h(tag, { on: this.$listeners }, this.$slots.default)
			},
		})
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'duplicates', 'allDuplicates', 'currentDuplicateId'],
			render(h) {
				return h('div', { class: `stub-${name}` })
			},
		})

		const App = loadComponent('src/App.vue', {
			'@nextcloud/dialogs': { showError: () => {}, showSuccess: () => {} },
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
			'./components/DuplicateTreemap.vue': { __esModule: true, default: stub('treemap') },
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('timeline') },
			'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity') },
			'./components/BatchAutoSelectWorkbench.vue': { __esModule: true, default: stub('batch') },
			'./components/FileHygieneInspector.vue': { __esModule: true, default: stub('hygiene') },
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link-sim') },
			'./components/FolderPairMatrix.vue': { __esModule: true, default: stub('folder-matrix') },
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('storage-footprint') },
			'./components/PhotoBurstTimeline.vue': { __esModule: true, default: stub('photo-burst') },
			'./components/RecoverySafetyWorkbench.vue': { __esModule: true, default: stub('recovery-safety') },
			'./components/ArchivePayloadInspector.vue': { __esModule: true, default: stub('archive-inspector') },
			'./components/AudioTagWorkbench.vue': { __esModule: true, default: stub('audio-workbench') },
			'./components/VideoSceneWorkbench.vue': { __esModule: true, default: stub('video-workbench') },
			'./components/SidecarSweepWorkbench.vue': { __esModule: true, default: stub('sidecar-sweep') },
			'./components/RuleProfilesWorkbench.vue': { __esModule: true, default: stub('rule-profiles') },
			'./components/DocumentLineageWorkbench.vue': { __esModule: true, default: stub('document-lineage') },
			'./components/PhotoPerceptualWorkbench.vue': { __esModule: true, default: stub('photo-perceptual') },
			'./components/BrokenMediaQuarantineWorkbench.vue': { __esModule: true, default: stub('broken-quarantine') },
			'./components/RetentionAgeWorkbench.vue': { __esModule: true, default: stub('retention-pruner') },
			'./components/FilenameCollisionWorkbench.vue': { __esModule: true, default: stub('filename-collisions') },
			'./components/QuotaAttributionWorkbench.vue': { __esModule: true, default: stub('quota-attribution') },
			'./components/PreviewCacheWorkbench.vue': { __esModule: true, default: stub('preview-cache') },
			'./components/ShareMountAuditorWorkbench.vue': { __esModule: true, default: stub('share-mount') },
			'./components/BackupDriftWorkbench.vue': { __esModule: true, default: stub('backup-drift') },
			'./components/AutomationRulebookWorkbench.vue': { __esModule: true, default: stub('automation-rulebook') },
			'./components/MetadataConsolidationWorkbench.vue': { __esModule: true, default: stub('metadata-consolidation') },
			'./components/ForensicVerifierWorkbench.vue': { __esModule: true, default: stub('forensic-verifier') },
			'./components/InodeSafetyWorkbench.vue': { __esModule: true, default: stub('inode-verifier') },
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
			'./components/VmContainerImageWorkbench.vue': { __esModule: true, default: VmContainerWorkbench },
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
			'./components/OriginFoldersSettings.vue': { __esModule: true, default: stub('origin') },
			'./components/ExcludedFoldersSettings.vue': { __esModule: true, default: stub('excluded') },
			'./components/BulkDeletionSettings.vue': { __esModule: true, default: stub('bulk') },
			'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects') },
			'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('project-duplicates') },
			'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('onboarding') },
			'./components/help/UsageExamples.vue': { __esModule: true, default: stub('usage') },
			'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
			'./components/FilterSettings.vue': { __esModule: true, default: stub('filters') },
			'@/tools/api': {
				fetchDuplicates: async status => ({
					entities: status === 'acknowledged' ? [] : buildSampleVmContainerDuplicates(),
					pagination: { currentPage: 1, totalPages: 1 },
				}),
				fetchProjects: async () => [],
				fetchScanStatus: async () => ({ isRunning: false, scannedFiles: 0, totalFiles: 0, percentage: 0 }),
				startUserScan: async () => ({}),
				notifyScanStarted: () => {},
				notifyScanCompleted: () => {},
				notifyScanFailed: () => {},
				fetchEmptyFolders: async () => [],
				deleteEmptyFolders: async () => ({ deleted: [] }),
			},
			'@/tools/utils': utils,
			'@/tools/keyboardShortcuts': keyboardShortcuts,
			'@/tools/reclamationHistory': reclamationHistory,
			'vue-material-design-icons/Folder': stub('icon-folder'),
			'vue-material-design-icons/FolderRemove': stub('icon-folder-remove'),
			'vue-material-design-icons/FolderMultiple': stub('icon-folder-multiple'),
			'vue-material-design-icons/Delete': stub('icon-delete'),
			'vue-material-design-icons/FilterOutline': stub('icon-filter-outline'),
		})

		const vm = new Vue({ render: h => h(App) }).$mount()
		await settle()

		const topbarBtn = vm.$el.querySelector('.topbar-vm-container-image-button')
		assert.ok(topbarBtn, 'Topbar VM & ISO Vault button must exist')

		const action = keyboardShortcuts.resolveShortcutAction({ key: 'I', shiftKey: true, target: vm.$el })
		assert.equal(action, 'toggle-vm-container-image-auditor')
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'i', shiftKey: false, target: vm.$el }), 'toggle-file-hygiene')

		topbarBtn.click()
		await settle()
		assert.ok(vm.$el.querySelector('.vm-container-image-workbench'), 'VmContainerImageWorkbench must mount on click')

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'I', shiftKey: true, bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.vm-container-image-workbench'), null, 'VmContainerImageWorkbench must toggle closed on Shift+I shortcut')

		vm.$destroy()
	})

	test('keeps zero U+2013/U+2014 typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/vmContainerImageAuditor.js',
			'src/components/VmContainerImageWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.equal(content.includes('\u2013'), false, `Unexpected U+2013 in ${relPath}`)
			assert.equal(content.includes('\u2014'), false, `Unexpected U+2014 in ${relPath}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `Unexpected XSS sink in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/VmContainerImageWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes('min-block-size: 44px'))
		assert.ok(vueContent.includes(':focus-visible'))
	})
})
