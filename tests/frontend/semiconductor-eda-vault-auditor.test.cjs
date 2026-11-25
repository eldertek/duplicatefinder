const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

/**
 * Load the pure Semiconductor EDA, ASIC/FPGA RTL, IC Layout & Waveform Vault auditor module.
 *
 * @return {object} Loaded module exports.
 */
function loadSemiconductorEdaVaultModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateStats': duplicateStats,
	})
	return loadModule('src/tools/semiconductorEdaVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

/**
 * Load SemiconductorEdaVaultWorkbench Vue component with mocked clipboard helper.
 *
 * @param {Array<string>} [copiedPayloads] Array collecting copied strings.
 * @return {object} Loaded Vue component definition.
 */
function loadSemiconductorEdaVaultWorkbench(copiedPayloads = []) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateStats': duplicateStats,
	})
	const semiconductorEdaVaultAuditor = loadModule('src/tools/semiconductorEdaVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/SemiconductorEdaVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async (text) => {
				copiedPayloads.push(text)
				return true
			},
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/semiconductorEdaVaultAuditor': semiconductorEdaVaultAuditor,
	})
}

/**
 * Build deterministic Semiconductor EDA, RTL, GDSII/OASIS & Waveform duplicate groups.
 *
 * @param {number} [nowMs] Reference epoch milliseconds.
 * @return {Array<object>} Sample duplicate groups.
 */
function buildSampleSemiconductorEdaDuplicates(nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)) {
	const twoDaysAgo = Math.floor((nowMs - 2 * 24 * 60 * 60 * 1000) / 1000)
	const thirtyDaysAgo = Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 2001,
			hash: 'hash-rtl-sv',
			acknowledged: false,
			files: [
				{
					id: 20011,
					path: '/Silicon_Vault/00_Tapeout/NPU_V4/rtl_vault/npu_mac_array.sv',
					size: 256 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 20012,
					path: '/Silicon_Vault/Mirror/NPU_V4/npu_mac_array.sv',
					size: 256 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 2002,
			hash: 'hash-sdc-constraints',
			acknowledged: false,
			files: [
				{
					id: 20021,
					path: '/Silicon_Vault/RTL_Vault/npu_v4_signoff.sdc',
					size: 64 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 20022,
					path: '/FPGA_Lab/Mirror/npu_v4_signoff.sdc',
					size: 64 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 2003,
			hash: 'hash-compressed-gds-anchor',
			acknowledged: false,
			files: [
				{
					id: 20031,
					path: '/Silicon_Vault/GDS_Archive/npu_top_rev3.gds.gz',
					size: 2200 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 20032,
					path: '/Silicon_Vault/Mirror/npu_top_rev3.gds.gz',
					size: 2200 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 2004,
			hash: 'hash-redundant-uncompressed-gds',
			acknowledged: false,
			files: [
				{
					id: 20041,
					path: '/Cadence/Innovus_Exports/npu_top_rev3.gds',
					size: 5600 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
				{
					id: 20042,
					path: '/Silicon_Lab/Calibre_Review/npu_top_rev3_raw.gds',
					size: 5600 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
			],
		},
		{
			id: 2005,
			hash: 'hash-unanchored-oas',
			acknowledged: false,
			files: [
				{
					id: 20051,
					path: '/Tapeout_Vault/Analog_Macro/pll_core_v2.oas',
					size: 900 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 20052,
					path: '/Staging/pll_core_v2.oas',
					size: 900 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 2006,
			hash: 'hash-compressed-fst-anchor',
			acknowledged: false,
			files: [
				{
					id: 20061,
					path: '/Silicon_Vault/Wave_Archive/dma_burst_smoke.fst',
					size: 480 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 20062,
					path: '/Silicon_Vault/Mirror/dma_burst_smoke.fst',
					size: 480 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 2007,
			hash: 'hash-redundant-uncompressed-vcd',
			acknowledged: false,
			files: [
				{
					id: 20071,
					path: '/Verif_Work/VCS_Runs/dma_burst_smoke.vcd',
					size: 4200 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
				{
					id: 20072,
					path: '/Verif_Work/GTKW/dma_burst_smoke_dump.vcd',
					size: 4200 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
			],
		},
		{
			id: 2008,
			hash: 'hash-unanchored-fsdb',
			acknowledged: false,
			files: [
				{
					id: 20081,
					path: '/Verif_Vault/axi_noc_stress.fsdb',
					size: 1800 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 20082,
					path: '/Verif_Lab/axi_noc_stress.fsdb',
					size: 1800 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 2009,
			hash: 'hash-eda-synth-sim-scratch',
			acknowledged: false,
			files: [
				{
					id: 20091,
					path: '/FPGA_Projects/vivado_cache/xsim.dir/tb_top_sim.elab_cache',
					size: 310 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 20092,
					path: '/FPGA_Projects/simv.daidir/tb_top_sim.elab_cache',
					size: 310 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 2010,
			hash: 'hash-csv-injection-eda',
			acknowledged: false,
			files: [
				{
					id: 20101,
					path: '/ASIC_Runs/innovus_tmp/=cmd|calc!A0.wlf.tmp',
					size: 64 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 20102,
					path: '/ASIC_Runs/calibre_tmp/archive_mirror/\'quoted\'/=cmd|calc!A0.wlf.tmp',
					size: 64 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 2011,
			hash: 'hash-unrelated-photo',
			acknowledged: false,
			files: [
				{
					id: 20111,
					path: '/Photos/Holiday/sunset_beach.jpg',
					size: 4096 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 20112,
					path: '/Photos/Holiday/sunset_beach_copy.jpg',
					size: 4096 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
	]
}

describe('Cycle 200: Semiconductor EDA, ASIC/FPGA RTL, IC Layout & Waveform Verification Vault Auditor', () => {
	test('classifies all 4 Semiconductor EDA families, detects toolchains, and ignores unrelated files', () => {
		const {
			classifySemiconductorEdaFile,
			isSemiconductorEdaGroup,
			extractEdaLineageStem,
		} = loadSemiconductorEdaVaultModule()

		const svMeta = classifySemiconductorEdaFile({
			path: '/Silicon_Vault/RTL/npu_mac_array.sv',
			size: 1024,
		})
		assert.equal(svMeta.family, 'rtl-constraints-ip')
		assert.equal(svMeta.isProtectedRtlConstraints, true)
		assert.equal(svMeta.isMutableFile, true)

		const sdcMeta = classifySemiconductorEdaFile({
			path: '/FPGA/Vivado/clock_constraints.xdc',
			size: 2048,
		})
		assert.equal(sdcMeta.family, 'rtl-constraints-ip')
		assert.equal(sdcMeta.edaToolchain, 'AMD Vivado / XSim')
		assert.equal(sdcMeta.isProtectedRtlConstraints, true)

		const gdsGzMeta = classifySemiconductorEdaFile({
			path: '/Tapeout_Vault/npu_top_rev3.gds.gz',
			size: 10000,
		})
		assert.equal(gdsGzMeta.family, 'ic-layout-tapeout')
		assert.equal(gdsGzMeta.isCompressedLayoutAnchor, true)
		assert.equal(gdsGzMeta.isProtectedCompressedTapeout, true)
		assert.equal(gdsGzMeta.isMutableFile, false)

		const rawGdsMeta = classifySemiconductorEdaFile({
			path: '/Cadence/Innovus/npu_top_rev3_raw.gds',
			size: 20000,
		})
		assert.equal(rawGdsMeta.family, 'ic-layout-tapeout')
		assert.equal(rawGdsMeta.isUncompressedLayoutFile, true)
		assert.equal(rawGdsMeta.lineageStem, 'npu_top_rev3')

		const fstMeta = classifySemiconductorEdaFile({
			path: '/Verif/Waveforms/dma_burst_smoke.fst',
			size: 50000,
		})
		assert.equal(fstMeta.family, 'sim-waveforms-coverage')
		assert.equal(fstMeta.isCompressedWaveformAnchor, true)
		assert.equal(fstMeta.isProtectedCompressedWaveform, true)
		assert.equal(fstMeta.isMutableFile, false)

		const vcdMeta = classifySemiconductorEdaFile({
			path: '/Verif/Sim/dma_burst_smoke_dump.vcd',
			size: 100000,
		})
		assert.equal(vcdMeta.family, 'sim-waveforms-coverage')
		assert.equal(vcdMeta.isUncompressedWaveformFile, true)
		assert.equal(vcdMeta.lineageStem, 'dma_burst_smoke')

		const scratchMeta = classifySemiconductorEdaFile({
			path: '/FPGA_Projects/vivado_cache/xsim.dir/tb_top_sim.elab_cache',
			size: 4096,
		})
		assert.equal(scratchMeta.family, 'eda-synth-sim-scratch')
		assert.equal(scratchMeta.isEdaScratchPath, true)

		// Generic .db / .v outside EDA context must not trigger false positives
		const sqliteDbMeta = classifySemiconductorEdaFile({
			path: '/Backups/Postgres/users_archive.db',
			size: 4096,
		})
		assert.equal(sqliteDbMeta.family, null)

		// Robotics SDF outside EDA context must not collide with EDA signoff .sdf
		const roboticsSdfMeta = classifySemiconductorEdaFile({
			path: '/Robotics/Gazebo/world_arena.sdf',
			size: 4096,
		})
		assert.equal(roboticsSdfMeta.family, null)

		assert.equal(
			extractEdaLineageStem('waveform.vcd', '/ASIC/uart_rx/sim_scratch/waveform.vcd'),
			'uart_rx_waveform'
		)
		assert.equal(
			isSemiconductorEdaGroup({
				files: [{ path: '/Photos/sunset.jpg', size: 1024 }],
			}),
			false
		)
	})

	test('conserves RTL/constraints, GDS.GZ, FST/UCDB, blocks unanchored .gds/.fsdb, and reclaims anchored dumps and scratch', () => {
		const { auditSemiconductorEdaVault } = loadSemiconductorEdaVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleSemiconductorEdaDuplicates(nowMs)

		const result = auditSemiconductorEdaVault(groups, {}, nowMs)
		assert.equal(result.schema, 'duplicatefinder.semiconductor-eda-vault-auditor.v1')
		assert.equal(result.summary.totalDomainGroupsCount, 10)
		assert.equal(result.summary.totalRtlClusters, 2)
		assert.equal(result.summary.totalRedundantGdsVcdClusters, 4)
		assert.equal(result.summary.totalEdaScratchClusters, 2)

		// RTL .sv and .sdc must be 100% shielded
		const svCluster = result.clusters.find(c => c.id === 2001)
		assert.ok(svCluster)
		assert.equal(svCluster.reclaimableBytes, 0)
		assert.equal(svCluster.members.every(m => m.shielded && m.action === 'keep'), true)

		const sdcCluster = result.clusters.find(c => c.id === 2002)
		assert.ok(sdcCluster)
		assert.equal(sdcCluster.reclaimableBytes, 0)

		// Compressed .gds.gz anchor conserved
		const gdsGzCluster = result.clusters.find(c => c.id === 2003)
		assert.ok(gdsGzCluster)
		assert.equal(gdsGzCluster.reclaimableBytes, 0)

		// Redundant uncompressed .gds backed by .gds.gz anchor -> safe to delete both copies
		const redundantGdsCluster = result.clusters.find(c => c.id === 2004)
		assert.ok(redundantGdsCluster)
		assert.equal(redundantGdsCluster.hasCompressedLayoutAnchor, true)
		assert.equal(redundantGdsCluster.clusterVerdict, 'uncompressed-gds-vcd-redundant')
		assert.equal(redundantGdsCluster.deleteTargetsCount, 2)
		assert.equal(redundantGdsCluster.reclaimableBytes, 2 * 5600 * 1024 * 1024)

		// Unanchored .oas without .oas.gz -> retains survivor and blocks extra copy under requireCompressedAnchorForPrune
		const unanchoredOasCluster = result.clusters.find(c => c.id === 2005)
		assert.ok(unanchoredOasCluster)
		assert.equal(unanchoredOasCluster.hasCompressedLayoutAnchor, false)
		assert.equal(unanchoredOasCluster.reclaimableBytes, 0)
		assert.equal(unanchoredOasCluster.members.every(m => m.shielded), true)

		// Compressed .fst anchor conserved
		const fstCluster = result.clusters.find(c => c.id === 2006)
		assert.ok(fstCluster)
		assert.equal(fstCluster.reclaimableBytes, 0)

		// Redundant uncompressed .vcd backed by .fst anchor -> safe to delete both copies
		const redundantVcdCluster = result.clusters.find(c => c.id === 2007)
		assert.ok(redundantVcdCluster)
		assert.equal(redundantVcdCluster.hasCompressedWaveformAnchor, true)
		assert.equal(redundantVcdCluster.clusterVerdict, 'uncompressed-gds-vcd-redundant')
		assert.equal(redundantVcdCluster.deleteTargetsCount, 2)
		assert.equal(redundantVcdCluster.reclaimableBytes, 2 * 4200 * 1024 * 1024)

		// Unanchored .fsdb without .fst/.fsdb.zst -> blocked
		const unanchoredFsdbCluster = result.clusters.find(c => c.id === 2008)
		assert.ok(unanchoredFsdbCluster)
		assert.equal(unanchoredFsdbCluster.hasCompressedWaveformAnchor, false)
		assert.equal(unanchoredFsdbCluster.reclaimableBytes, 0)

		// EDA scratch retains 1 survivor and deletes 1 redundant copy when keepRecentTapeoutDays=0
		const scratchCluster = result.clusters.find(c => c.id === 2009)
		assert.ok(scratchCluster)
		assert.equal(scratchCluster.deleteTargetsCount, 1)
		assert.equal(scratchCluster.reclaimableBytes, 310 * 1024 * 1024)

		// 14-day tapeout grace shields recent 2-day scratch while reclaiming 30-day scratch; 45-day shields both
		const graceResult14 = auditSemiconductorEdaVault(groups, {
			presetId: 'eda-synth-sim-scratch-cleanup',
		}, nowMs)
		const graceScratch14 = graceResult14.clusters.find(c => c.id === 2009)
		assert.ok(graceScratch14)
		assert.equal(graceScratch14.members.find(m => m.id === 20092).shielded, true)
		assert.equal(graceScratch14.members.find(m => m.id === 20091).action, 'delete')

		const graceResult45 = auditSemiconductorEdaVault(groups, {
			keepRecentTapeoutDays: 45,
		}, nowMs)
		const graceScratch45 = graceResult45.clusters.find(c => c.id === 2009)
		assert.ok(graceScratch45)
		assert.equal(graceScratch45.reclaimableBytes, 0)
		assert.equal(graceScratch45.members.every(m => m.shielded), true)
	})

	test('supports hardlink strategy blocking mutable files, per-copy overrides, DRY_RUN=1 script, CWE-1236 CSV, JSON, and .sync-exclude.lst', () => {
		const {
			auditSemiconductorEdaVault,
			buildSemiconductorEdaRemediationScript,
			buildSemiconductorEdaCsvReport,
			buildSemiconductorEdaJsonManifest,
			buildSemiconductorEdaSyncExcludeList,
		} = loadSemiconductorEdaVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleSemiconductorEdaDuplicates(nowMs)

		// Disabling compressed shields under hardlink strategy allows hardlinking immutable .gds.gz/.fst but NEVER mutable .sv or scratch
		const hardlinkAudit = auditSemiconductorEdaVault(groups, {
			strategy: 'hardlink-immutable-tapeout-and-waveforms',
			protectCompressedTapeoutAndSignoff: false,
			protectCompressedWaveforms: false,
		}, nowMs)

		const gdsGz = hardlinkAudit.clusters.find(c => c.id === 2003)
		assert.equal(gdsGz.hardlinkTargetsCount, 1)
		assert.equal(gdsGz.members.some(m => m.action === 'hardlink'), true)

		const sv = hardlinkAudit.clusters.find(c => c.id === 2001)
		assert.equal(sv.hardlinkTargetsCount, 0)

		const scratch = hardlinkAudit.clusters.find(c => c.id === 2009)
		assert.equal(scratch.hardlinkTargetsCount, 0)
		assert.equal(scratch.deleteTargetsCount, 1)

		const script = buildSemiconductorEdaRemediationScript(hardlinkAudit)
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('run_cmd ln -f '))
		assert.ok(script.includes('\'"\'"\'quoted\'"\'"\''))
		assert.ok(!script.includes('npu_mac_array.sv'))

		// Quarantine strategy moves redundant .gds/.vcd and scratch to QUARANTINE_DIR
		const quarantineAudit = auditSemiconductorEdaVault(groups, {
			presetId: 'redundant-uncompressed-waveform-audit',
		}, nowMs)
		assert.equal(quarantineAudit.clusters.every(c => c.family === 'sim-waveforms-coverage'), true)
		const qScript = buildSemiconductorEdaRemediationScript(quarantineAudit)
		assert.ok(qScript.includes('run_cmd mv -n '))
		assert.ok(qScript.includes('QUARANTINE_DIR'))

		// Per-copy override: shield a redundant .vcd copy
		const overrideAudit = auditSemiconductorEdaVault(groups, {
			memberOverrides: {
				20071: 'keep',
			},
		}, nowMs)
		const vcdCluster = overrideAudit.clusters.find(c => c.id === 2007)
		assert.equal(vcdCluster.deleteTargetsCount, 1)

		// CWE-1236 formula-injection safe CSV
		const csv = buildSemiconductorEdaCsvReport(hardlinkAudit)
		assert.ok(csv.includes('"\'=cmd|calc!A0') || csv.includes('\'=cmd|calc!A0'))
		assert.ok(csv.includes('eda_toolchain'))

		// JSON manifest schema
		const manifest = JSON.parse(buildSemiconductorEdaJsonManifest(hardlinkAudit))
		assert.equal(manifest.schema, 'duplicatefinder.semiconductor-eda-vault-auditor.v1')
		assert.ok(Array.isArray(manifest.clusters))

		// .sync-exclude.lst rules
		const syncExclude = buildSemiconductorEdaSyncExcludeList()
		assert.ok(syncExclude.includes('xsim.dir/'))
		assert.ok(syncExclude.includes('simv.daidir/'))
		assert.ok(syncExclude.includes('xcelium.d/'))
		assert.ok(syncExclude.includes('*.elab_cache'))
	})

	test('SemiconductorEdaVaultWorkbench.vue renders empty state, populated workspace, unclamped numeric input, presets, overrides, and clipboard actions', async () => {
		const copied = []
		const Workbench = loadSemiconductorEdaVaultWorkbench(copied)

		// 1. Empty state
		const emptyNode = document.createElement('div')
		document.body.appendChild(emptyNode)
		const emptyVm = new Vue({
			render: h => h(Workbench, {
				props: { duplicates: [], allDuplicates: [] },
			}),
		}).$mount(emptyNode)
		try {
			await settle()
			assert.ok(emptyVm.$el.querySelector('.sev__empty-banner'))
			assert.equal(emptyVm.$el.querySelector('.sev__workspace'), null)
		} finally {
			emptyVm.$destroy()
			emptyNode.remove()
		}

		// 2. Populated state + unclamped numeric input + preset + override + clipboard
		const groups = buildSampleSemiconductorEdaDuplicates()
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: groups,
					allDuplicates: groups,
					currentDuplicateId: 2004,
				},
			}),
		}).$mount(mountNode)
		try {
			await settle()
			const workbench = vm.$children[0]
			assert.ok(workbench.$el.querySelector('.sev__workspace'))
			assert.equal(workbench.selectedCluster.id, 2004)

			// Unclamped numeric input mid-keystroke
			const numInputs = workbench.$el.querySelectorAll('input.sev__num-input')
			assert.equal(numInputs.length, 2)
			numInputs[0].value = ''
			numInputs[0].dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(workbench.keepRecentTapeoutDaysInput, '')
			assert.equal(workbench.parsedKeepRecentTapeoutDays, 0)

			// Copy script
			const copyScriptBtn = Array.from(workbench.$el.querySelectorAll('button')).find(
				btn => btn.textContent.includes('Copy DRY_RUN=1 Script')
			)
			assert.ok(copyScriptBtn)
			copyScriptBtn.click()
			await settle()
			assert.equal(copied.length, 1)
			assert.ok(copied[0].includes('DRY_RUN="${DRY_RUN:-1}"'))

			// Apply waveform preset -> switches familyFilter and strategy
			const wavePresetBtn = Array.from(workbench.$el.querySelectorAll('.sev__seg-btn')).find(
				btn => btn.textContent.includes('Redundant .vcd/.fsdb/.wlf')
			)
			assert.ok(wavePresetBtn)
			wavePresetBtn.click()
			await settle()
			assert.equal(workbench.familyFilter, 'sim-waveforms-coverage')
			assert.equal(workbench.strategy, 'quarantine-uncompressed-dumps-and-scratch')

			// Reset filter empty state check
			workbench.searchQueryInput = 'nonexistent-asic-xyz-999'
			await settle()
			assert.ok(workbench.$el.querySelector('.sev__empty-filter'))
			const resetBtn = workbench.$el.querySelector('.sev__empty-filter button')
			resetBtn.click()
			await settle()
			assert.equal(workbench.searchQueryInput, '')
			assert.ok(workbench.$el.querySelector('.sev__workspace'))
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue wires SemiconductorEdaVaultWorkbench with Shift+F5 shortcut cleanly', async () => {
		window.localStorage.clear()
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const icon = { render: h => h('span') }
		const slotBox = tag => ({
			render(h) {
				return h(tag, this.$slots.default)
			},
		})
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'isScanning'],
			render(h) {
				return h('div', { class: `stub-${name}` })
			},
		})

		const SearchBar = loadComponent('src/components/SearchBar.vue', {
			'vue-material-design-icons/ChevronDown': icon,
		})
		const NcAppNavigationItemStub = {
			props: ['name', 'title', 'allowCollapse', 'open', 'active'],
			render(h) {
				return h('div', { class: 'nc-nav-item' }, [
					h('button', { attrs: { type: 'button' } }, this.name),
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
		const SemiconductorEdaVaultWorkbench = loadSemiconductorEdaVaultWorkbench()

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
			'./components/SemiconductorEdaVaultWorkbench.vue': { __esModule: true, default: SemiconductorEdaVaultWorkbench },
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
					entities: type === 'unacknowledged' ? buildSampleSemiconductorEdaDuplicates() : [],
					pagination: { currentPage: 1, totalPages: 1, totalItems: 10, hasMore: false },
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

			const btn = vm.$el.querySelector('button.topbar-semiconductor-eda-vault-button')
			assert.ok(btn, 'Semiconductor & EDA Vault button is rendered in topbar')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Shift+F5')
			assert.equal(vm.$el.querySelector('.semiconductor-eda-vault-workbench'), null)

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F5', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.ok(vm.$el.querySelector('.semiconductor-eda-vault-workbench'), 'SemiconductorEdaVaultWorkbench must open on Shift+F5 shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F5', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.$el.querySelector('.semiconductor-eda-vault-workbench'), null, 'SemiconductorEdaVaultWorkbench must toggle closed on Shift+F5 shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Semiconductor & EDA Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/semiconductorEdaVaultAuditor.js',
			'src/components/SemiconductorEdaVaultWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `No U+2013/U+2014 in ${rel}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `No XSS sink in ${rel}`)
		}
	})
})
