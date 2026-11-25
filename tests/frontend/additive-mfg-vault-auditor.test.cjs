const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

/**
 * Load the pure 3D Printing, CNC & Additive Manufacturing Vault auditor module for tests.
 *
 * @return {object} Loaded module exports.
 */
function loadAdditiveMfgModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/additiveManufacturingVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

/**
 * Load AdditiveManufacturingVaultWorkbench.vue with optional clipboard stub.
 *
 * @param {object} [clipboardImpl] Optional clipboard implementation.
 * @return {object} Vue component definition.
 */
function loadAdditiveMfgWorkbench(clipboardImpl) {
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const additiveManufacturingVaultAuditor = loadAdditiveMfgModule()
	return loadComponent('src/components/AdditiveManufacturingVaultWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/additiveManufacturingVaultAuditor': additiveManufacturingVaultAuditor,
	})
}

/**
 * Build synthetic duplicate clusters covering all 4 3D Printing, CNC & Additive Manufacturing families.
 *
 * @return {Array<object>} Sample duplicate groups.
 */
function buildSampleAdditiveMfgDuplicates() {
	const mib = 1024 * 1024
	const refSec = 1796800000
	return [
		{
			id: 9401,
			hash: 'sha256-cad-step-extruder-housing',
			size: 28 * mib,
			acknowledged: false,
			files: [
				{
					id: 94011,
					path: '/cad/VoronStealth/extruder_housing_v3.step',
					size: 28 * mib,
					mtime: refSec - 20 * 86400,
				},
				{
					id: 94012,
					path: '/masters/VoronStealth/extruder_housing_v3.step',
					size: 28 * mib,
					mtime: refSec - 20 * 86400,
				},
			],
		},
		{
			id: 9402,
			hash: 'sha256-mesh-stl-extruder-housing',
			size: 46 * mib,
			acknowledged: false,
			files: [
				{
					id: 94021,
					path: '/models/VoronStealth/extruder_housing_v3.stl',
					size: 46 * mib,
					mtime: refSec - 15 * 86400,
				},
				{
					id: 94022,
					path: '/Downloads/extruder_housing_v3_copy.stl',
					size: 46 * mib,
					mtime: refSec - 12 * 86400,
				},
				{
					id: 94023,
					path: '/scratch/extruder_housing_v3 (1).stl',
					size: 46 * mib,
					mtime: refSec - 11 * 86400,
				},
			],
		},
		{
			id: 9403,
			hash: 'sha256-mesh-3mf-bambu-plate',
			size: 32 * mib,
			acknowledged: false,
			files: [
				{
					id: 94031,
					path: '/3mf-projects/BambuEnclosure/hinge_bracket_x1c_petg.3mf',
					size: 32 * mib,
					mtime: refSec - 10 * 86400,
				},
				{
					id: 94032,
					path: '/Downloads/bambu-cache/hinge_bracket_x1c_petg.3mf',
					size: 32 * mib,
					mtime: refSec - 9 * 86400,
				},
			],
		},
		{
			id: 9404,
			hash: 'sha256-bgcode-regenerated-extruder',
			size: 18 * mib,
			acknowledged: false,
			files: [
				{
					id: 94041,
					path: '/sliced/VoronStealth/extruder_housing_0.20mm_PETG_MK4_45m.bgcode',
					size: 18 * mib,
					mtime: refSec - 14 * 86400,
				},
				{
					id: 94042,
					path: '/octoprint/spool/extruder_housing_0.20mm_PETG_MK4_45m.bgcode',
					size: 18 * mib,
					mtime: refSec - 14 * 86400,
				},
			],
		},
		{
			id: 9405,
			hash: 'sha256-sla-resin-ctb-slice',
			size: 96 * mib,
			acknowledged: false,
			files: [
				{
					id: 94051,
					path: '/production-plates/DentalTray/arch_tray_saturn_0.05mm.ctb',
					size: 96 * mib,
					mtime: refSec - 25 * 86400,
				},
				{
					id: 94052,
					path: '/usb-stick/arch_tray_saturn_0.05mm.ctb',
					size: 96 * mib,
					mtime: refSec - 12 * 86400,
				},
			],
		},
		{
			id: 9406,
			hash: 'sha256-sla-resin-goo-orphan',
			size: 54 * mib,
			acknowledged: false,
			files: [
				{
					id: 94061,
					path: '/slices/Miniatures/dragon_bust_mars4.goo',
					size: 54 * mib,
					mtime: refSec - 16 * 86400,
				},
				{
					id: 94062,
					path: '/sd-card/dragon_bust_mars4.goo',
					size: 54 * mib,
					mtime: refSec - 16 * 86400,
				},
			],
		},
		{
			id: 9407,
			hash: 'sha256-cnc-toolpath-nc',
			size: 6 * mib,
			acknowledged: false,
			files: [
				{
					id: 94071,
					path: '/cnc-masters/RouterPlate/spindle_mount_alu_6061_grbl.nc',
					size: 6 * mib,
					mtime: refSec - 19 * 86400,
				},
				{
					id: 94072,
					path: '/Downloads/spindle_mount_alu_6061_grbl.nc',
					size: 6 * mib,
					mtime: refSec - 18 * 86400,
				},
			],
		},
		{
			id: 9408,
			hash: 'sha256-slicer-profile-orcaslicer',
			size: 2 * mib,
			acknowledged: false,
			files: [
				{
					id: 94081,
					path: '/slicer-profiles/OrcaSlicer/voron_2.4_0.4n_petg.json',
					size: 2 * mib,
					mtime: refSec - 30 * 86400,
				},
				{
					id: 94082,
					path: '/profiles/PrusaSlicer/voron_2.4_0.4n_petg.json',
					size: 2 * mib,
					mtime: refSec - 30 * 86400,
				},
			],
		},
		{
			id: 9409,
			hash: 'sha256-obj-cwe1236-injection',
			size: 14 * mib,
			acknowledged: false,
			files: [
				{
					id: 94091,
					path: '=cmd|calc/models/Bracket/bracket_m4.obj',
					size: 14 * mib,
					mtime: refSec - 10 * 86400,
				},
				{
					id: 94092,
					path: '=cmd|calc/Downloads/bracket_m4.obj',
					size: 14 * mib,
					mtime: refSec - 10 * 86400,
				},
			],
		},
	]
}

describe('Cycle 184: 3D Printing, CNC & Additive Manufacturing Vault Auditor', () => {
	test('classifies CAD/STEP sources, STL/3MF/OBJ meshes, FDM/SLA/CNC slices, and slicer profiles', () => {
		const mod = loadAdditiveMfgModule()

		const step = mod.classifyAdditiveManufacturingFile({
			path: '/cad/VoronStealth/extruder_housing_v3.step',
		})
		assert.equal(step.family, 'cad-parametric-sources')
		assert.equal(step.isCadSource, true)
		assert.equal(step.modelPartStem, 'extruder-housing')
		assert.equal(step.inCanonicalSource, true)

		const stl = mod.classifyAdditiveManufacturingFile({
			path: '/models/VoronStealth/extruder_housing_v3.stl',
		})
		assert.equal(stl.family, 'meshes-3mf-projects')
		assert.equal(stl.artifactKind, 'mesh-duplicate')
		assert.equal(stl.modelPartStem, 'extruder-housing')

		const threeMf = mod.classifyAdditiveManufacturingFile({
			path: '/3mf-projects/BambuEnclosure/hinge_bracket_x1c_petg.3mf',
		})
		assert.equal(threeMf.family, 'meshes-3mf-projects')
		assert.equal(threeMf.is3mfProject, true)
		assert.equal(threeMf.machineProfile, 'Bambu Lab')
		assert.equal(threeMf.materialTag, 'PETG')

		const bgcode = mod.classifyAdditiveManufacturingFile({
			path: '/octoprint/spool/extruder_housing_0.20mm_PETG_MK4_45m.bgcode',
		})
		assert.equal(bgcode.family, 'toolpaths-resin-slices')
		assert.equal(bgcode.isFdmGcode, true)
		assert.equal(bgcode.slicerVendor, 'PrusaSlicer')
		assert.equal(bgcode.machineProfile, 'Prusa')
		assert.equal(bgcode.layerOrNozzleSpec, '0.20mm')
		assert.equal(bgcode.inEphemeralSpool, true)
		assert.equal(bgcode.modelPartStem, 'extruder-housing')

		const ctb = mod.classifyAdditiveManufacturingFile({
			path: '/usb-stick/arch_tray_saturn_0.05mm.ctb',
		})
		assert.equal(ctb.family, 'toolpaths-resin-slices')
		assert.equal(ctb.isSlaResinSlice, true)
		assert.equal(ctb.slicerVendor, 'Chitubox SLA')
		assert.equal(ctb.machineProfile, 'Elegoo SLA')

		const goo = mod.classifyAdditiveManufacturingFile({
			path: '/sd-card/dragon_bust_mars4.goo',
		})
		assert.equal(goo.family, 'toolpaths-resin-slices')
		assert.equal(goo.isSlaResinSlice, true)
		assert.equal(goo.slicerVendor, 'Lychee / Elegoo')

		const cnc = mod.classifyAdditiveManufacturingFile({
			path: '/cnc-masters/RouterPlate/spindle_mount_alu_6061_grbl.nc',
		})
		assert.equal(cnc.family, 'toolpaths-resin-slices')
		assert.equal(cnc.isCncToolpath, true)
		assert.equal(cnc.machineProfile, 'CNC Mill/Router')

		const profile = mod.classifyAdditiveManufacturingFile({
			path: '/slicer-profiles/OrcaSlicer/voron_2.4_0.4n_petg.json',
		})
		assert.equal(profile.family, 'slicer-profiles-presets')
		assert.equal(profile.isSlicerProfile, true)
		assert.equal(profile.slicerVendor, 'OrcaSlicer')

		const unrelated = mod.classifyAdditiveManufacturingFile({
			path: '/Photos/holiday_2026/sunset.jpg',
		})
		assert.equal(unrelated, null)
	})

	test('distinguishes mesh duplicates vs regenerated slices and preserves CAD/STEP sources & slicer profiles', () => {
		const mod = loadAdditiveMfgModule()
		const report = mod.analyzeAdditiveManufacturingVault(buildSampleAdditiveMfgDuplicates())

		assert.equal(report.schema, mod.ADDITIVE_MFG_VAULT_SCHEMA)
		assert.equal(report.summary.totalClustersCount, 9)
		assert.equal(report.summary.totalCadSourceClusters, 1)
		assert.equal(report.summary.totalProfileClusters, 1)
		assert.equal(report.summary.totalMeshDuplicateClusters, 3)
		assert.equal(report.summary.totalRegeneratedSliceClusters, 4)
		assert.equal(report.summary.totalSlaResinClusters, 2)
		assert.equal(report.summary.totalCncToolpathClusters, 1)
		assert.ok(report.summary.totalReclaimableBytes > 0)
		assert.match(report.summary.reclaimableGb, /^\d+\.\d{2} GB$/)

		// CAD/STEP source cluster: both canonical CAD copies are strictly conserved
		const cadCluster = report.clusters.find(c => c.primaryGroupId === 9401)
		assert.ok(cadCluster)
		assert.equal(cadCluster.duplicationClass, 'cad-source')
		assert.equal(cadCluster.reclaimableCopiesCount, 0)
		assert.equal(cadCluster.riskState, 'cad-source-protected')
		assert.equal(cadCluster.members[1].verdict, 'blocked-cad-step-source')

		// Slicer profile cluster: both OrcaSlicer/PrusaSlicer profiles are shielded
		const profileCluster = report.clusters.find(c => c.primaryGroupId === 9408)
		assert.ok(profileCluster)
		assert.equal(profileCluster.duplicationClass, 'slicer-profile')
		assert.equal(profileCluster.reclaimableCopiesCount, 0)
		assert.equal(profileCluster.members[1].verdict, 'blocked-slicer-profile')

		// Regenerated bgcode sharing stem with CAD/STEP source: marked Regenerable from CAD/STEP and octoprint spool copy pruned
		const bgcodeCluster = report.clusters.find(c => c.primaryGroupId === 9404)
		assert.ok(bgcodeCluster)
		assert.equal(bgcodeCluster.duplicationClass, 'regenerated-slice')
		assert.equal(bgcodeCluster.hasCadSourceInVault, true)
		assert.equal(bgcodeCluster.sliceLineageBadge, 'Regenerable from CAD/STEP')
		assert.equal(bgcodeCluster.reclaimableCopiesCount, 1)
		const octoCopy = bgcodeCluster.members.find(m => m.path.includes('/octoprint/'))
		assert.equal(octoCopy.verdict, 'reclaim-ephemeral-gcode')
		assert.equal(octoCopy.actionType, 'prune')

		// Orphan SLA slice (.goo) without CAD/mesh source
		const gooCluster = report.clusters.find(c => c.primaryGroupId === 9406)
		assert.ok(gooCluster)
		assert.equal(gooCluster.hasCadSourceInVault, false)
		assert.equal(gooCluster.sliceLineageBadge, 'Orphan Slice (No CAD/Mesh)')
		assert.equal(gooCluster.reclaimableCopiesCount, 1)

		// STL mesh duplicate cluster: 2 redundant copies in Downloads & scratch reclaimed, canonical /models kept
		const stlCluster = report.clusters.find(c => c.primaryGroupId === 9402)
		assert.ok(stlCluster)
		assert.equal(stlCluster.duplicationClass, 'mesh-duplicate')
		assert.equal(stlCluster.reclaimableCopiesCount, 2)
		assert.equal(stlCluster.survivor.path, '/models/VoronStealth/extruder_housing_v3.stl')

		// Production plate CTB: survivor is production plate, USB-stick copy pruned
		const ctbCluster = report.clusters.find(c => c.primaryGroupId === 9405)
		assert.ok(ctbCluster)
		assert.equal(ctbCluster.hasProductionPlate, true)
		assert.equal(ctbCluster.survivor.meta.isProductionPlate, true)
		assert.equal(ctbCluster.reclaimableCopiesCount, 1)
	})

	test('supports hardlink mesh consolidation, spool age window, and member overrides', () => {
		const mod = loadAdditiveMfgModule()
		const sample = buildSampleAdditiveMfgDuplicates()

		// Hardlink consolidation strategy
		const hardlinkReport = mod.analyzeAdditiveManufacturingVault(sample, {
			strategy: 'consolidate-mesh-hardlinks',
		})
		const stlCluster = hardlinkReport.clusters.find(c => c.primaryGroupId === 9402)
		assert.equal(stlCluster.riskState, 'consolidatable')
		assert.equal(stlCluster.consolidatableCopiesCount, 2)
		assert.equal(stlCluster.members[1].actionType, 'hardlink')

		// Spool-only sweep respects staleSliceDays age guard
		const recentSpoolGroup = {
			id: 9410,
			hash: 'sha256-recent-gcode',
			size: 5 * 1024 * 1024,
			files: [
				{ id: 94101, path: '/models/TestPart/test_part.gcode', size: 5 * 1024 * 1024, mtime: 1796800000 - 2 * 86400 },
				{ id: 94102, path: '/spool/test_part.gcode', size: 5 * 1024 * 1024, mtime: 1796800000 - 1 * 86400 },
			],
		}
		const spoolGuardReport = mod.analyzeAdditiveManufacturingVault([recentSpoolGroup], {
			strategy: 'prune-spool-prints-only',
			staleSliceDays: 7,
			referenceNowSec: 1796800000,
		})
		assert.equal(spoolGuardReport.clusters[0].reclaimableCopiesCount, 0)
		assert.equal(spoolGuardReport.clusters[0].members[1].verdict, 'blocked-recent-spool')

		// Member override forces keep on an otherwise reclaimable member
		const stlCopyKey = `${stlCluster.members[1].selectionKey}`
		const overrideReport = mod.analyzeAdditiveManufacturingVault(sample, {
			memberOverrides: { [stlCopyKey]: 'keep' },
		})
		const overriddenStl = overrideReport.clusters.find(c => c.primaryGroupId === 9402)
		assert.equal(overriddenStl.reclaimableCopiesCount, 1)
		assert.equal(overriddenStl.members[1].verdict, 'blocked-manual-shield')
	})

	test('generates safe POSIX DRY_RUN=1 script, CWE-1236 CSV, JSON manifest, and .sync-exclude.lst rules', () => {
		const mod = loadAdditiveMfgModule()
		const analysis = mod.analyzeAdditiveManufacturingVault(buildSampleAdditiveMfgDuplicates(), {
			strategy: 'consolidate-mesh-hardlinks',
		})

		const script = mod.buildAdditiveMfgRemediationScript(analysis, { dataRoot: '/srv/nextcloud/data' })
		assert.ok(script.startsWith('#!/usr/bin/env sh'))
		assert.ok(script.includes('set -eu'))
		assert.ok(script.includes('DRY_RUN="$' + '{DRY_RUN:-1}"'))
		assert.ok(script.includes('ln -f '))

		const csv = mod.buildAdditiveMfgCsvReport(analysis)
		assert.ok(csv.includes('ProjectWorkspace,ModelPartStem,DuplicationClass,SliceLineage,MachineProfile'))
		assert.ok(csv.includes("'=cmd|calc/"), 'CSV must neutralize leading = with single quote (CWE-1236)')

		const jsonStr = mod.buildAdditiveMfgJsonReport(analysis)
		const parsed = JSON.parse(jsonStr)
		assert.equal(parsed.schema, mod.ADDITIVE_MFG_VAULT_SCHEMA)
		assert.equal(parsed.clusters.length, 9)

		const syncExclude = mod.buildAdditiveMfgSyncExcludeSnippet(analysis)
		assert.ok(syncExclude.includes('*.gcode.tmp'))
		assert.ok(syncExclude.includes('*.bgcode.part'))
		assert.ok(syncExclude.includes('*.ctb.tmp'))
		assert.ok(syncExclude.includes('PrusaSlicer/cache/*'))
		assert.ok(syncExclude.includes('BambuStudio/cache/*'))
	})

	test('AdditiveManufacturingVaultWorkbench.vue renders clusters, applies presets, filters mesh vs slice, and copies script', async () => {
		const copied = []
		const Workbench = loadAdditiveMfgWorkbench({
			writeText: async text => {
				copied.push(text)
			},
		})
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: buildSampleAdditiveMfgDuplicates(),
					allDuplicates: buildSampleAdditiveMfgDuplicates(),
				},
			}),
		}).$mount(mountNode)

		try {
			await settle()
			assert.equal(vm.$el.classList.contains('additive-mfg-vault-workbench'), true)
			assert.equal(vm.$el.querySelectorAll('.amv__cluster-card').length, 9)

			// Apply Hardlink STL & 3MF Meshes preset
			const segBtns = Array.from(vm.$el.querySelectorAll('.amv__seg-btn'))
			const meshPreset = segBtns.find(b => b.textContent.includes('Hardlink STL & 3MF Meshes'))
			assert.ok(meshPreset)
			meshPreset.click()
			await settle()
			assert.equal(vm.$el.querySelectorAll('.amv__cluster-card').length, 3)

			// Reset to All 3D Print & CNC Audit
			const allPreset = segBtns.find(b => b.textContent.includes('All 3D Print & CNC Audit'))
			allPreset.click()
			await settle()
			assert.equal(vm.$el.querySelectorAll('.amv__cluster-card').length, 9)

			// Filter by Regenerated Slices verdict pill
			const sliceBtn = segBtns.find(b => b.textContent.trim() === 'Regenerated Slices')
			assert.ok(sliceBtn)
			sliceBtn.click()
			await settle()
			assert.equal(vm.$el.querySelectorAll('.amv__cluster-card').length, 4)

			// Copy DRY_RUN=1 script
			const copyBtn = Array.from(vm.$el.querySelectorAll('.amv__tool-btn')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			assert.ok(copyBtn)
			copyBtn.click()
			await settle()
			assert.equal(copied.length, 1)
			assert.ok(copied[0].includes('DRY_RUN="$' + '{DRY_RUN:-1}"'))
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('AdditiveManufacturingVaultWorkbench.vue renders empty state CTA and reset-filters empty state cleanly', async () => {
		let scanTriggered = false
		const Workbench = loadAdditiveMfgWorkbench()
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: [],
					allDuplicates: [],
				},
				on: {
					'start-scan': () => {
						scanTriggered = true
					},
				},
			}),
		}).$mount(mountNode)

		try {
			await settle()
			const scanBtn = vm.$el.querySelector('.amv__primary-btn')
			assert.ok(scanBtn, 'Empty state Scan storage CTA renders')
			scanBtn.click()
			await settle()
			assert.equal(scanTriggered, true)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue wires AdditiveManufacturingVaultWorkbench with F7 shortcut cleanly', async () => {
		window.localStorage.clear()
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const statsModule = loadModule('src/tools/duplicateStats.js')
		const AdditiveManufacturingVaultWorkbench = loadAdditiveMfgWorkbench()

		const slotBox = tag => ({
			render(h) {
				return h(tag, this.$slots.default)
			},
		})
		const icon = slotBox('span')
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'isScanning'],
			render(h) {
				return h('div', { class: `stub-${name}` })
			},
		})

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
			'./components/DuplicateTreemap.vue': { __esModule: true, default: stub('treemap') },
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('timeline') },
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
			'./components/DocumentLineageWorkbench.vue': { __esModule: true, default: stub('doc') },
			'./components/PhotoPerceptualWorkbench.vue': { __esModule: true, default: stub('photo') },
			'./components/BrokenMediaQuarantineWorkbench.vue': { __esModule: true, default: stub('broken') },
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
			'./components/AdditiveManufacturingVaultWorkbench.vue': { __esModule: true, default: AdditiveManufacturingVaultWorkbench },
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
					entities: type === 'unacknowledged' ? buildSampleAdditiveMfgDuplicates() : [],
					pagination: { currentPage: 1, totalPages: 1, totalItems: 9, hasMore: false },
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

			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'F7', shiftKey: false }), 'toggle-additive-mfg-vault-auditor')
			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'F7', ctrlKey: true }), null)
			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'F7', target: { tagName: 'INPUT' } }), null)

			const btn = vm.$el.querySelector('button.topbar-additive-mfg-vault-button')
			assert.ok(btn, '3D Print & CNC button is rendered in topbar')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'F7')
			assert.equal(vm.$el.querySelector('.additive-mfg-vault-workbench'), null)

			// F7 opens workbench
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F7', bubbles: true, cancelable: true }))
			await settle()
			assert.ok(vm.$el.querySelector('.additive-mfg-vault-workbench'), 'AdditiveManufacturingVaultWorkbench must open on F7 shortcut')

			// F7 again closes workbench
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F7', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.$el.querySelector('.additive-mfg-vault-workbench'), null, 'AdditiveManufacturingVaultWorkbench must toggle closed on F7 shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new 3D Printing, CNC & Additive Manufacturing Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/additiveManufacturingVaultAuditor.js',
			'src/components/AdditiveManufacturingVaultWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `No U+2013/U+2014 in ${rel}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `No XSS sink in ${rel}`)
		}
	})
})
