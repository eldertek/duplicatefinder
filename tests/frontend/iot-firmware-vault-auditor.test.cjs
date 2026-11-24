const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

/**
 * Load the pure IoT Firmware, Embedded ROM & Hardware Lab Vault auditor module.
 *
 * @return {object} Loaded module exports.
 */
function loadIotFirmwareVaultModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateStats': duplicateStats,
	})
	return loadModule('src/tools/iotFirmwareVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

/**
 * Load IotFirmwareVaultWorkbench Vue component with mocked clipboard helper.
 *
 * @param {Array<string>} [copiedPayloads] Array collecting copied strings.
 * @return {object} Loaded Vue component definition.
 */
function loadIotFirmwareVaultWorkbench(copiedPayloads = []) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateStats': duplicateStats,
	})
	const iotFirmwareVaultAuditor = loadModule('src/tools/iotFirmwareVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/IotFirmwareVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async (text) => {
				copiedPayloads.push(text)
				return true
			},
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/iotFirmwareVaultAuditor': iotFirmwareVaultAuditor,
	})
}

/**
 * Build deterministic IoT Firmware, Embedded ROM & Hardware Lab duplicate groups
 * covering firmware images (.bin, .hex, .elf, .uf2, .dfu, .img, .srec), KiCad/Altium sources
 * (.kicad_sch, .kicad_pcb, .schdoc, .pcbdoc), Gerbers/BOMs (.gbr, .drl, gerber .zip, bom .csv),
 * and oscilloscope/logic analyzer captures (.sr, .sal, .vcd, .csv).
 *
 * @param {number} [nowMs] Reference epoch milliseconds.
 * @return {Array<object>} Sample duplicate groups.
 */
function buildSampleIotFirmwareDuplicates(nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)) {
	const twoDaysAgo = Math.floor((nowMs - 2 * 24 * 60 * 60 * 1000) / 1000)
	const thirtyDaysAgo = Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 1931,
			hash: 'hash-stm32-firmware-bin',
			acknowledged: false,
			files: [
				{
					id: 19311,
					path: '/Hardware_Vault/Signed_Releases/STM32F407/stm32f407_gateway_v1.4.2_signed.bin',
					size: 512 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19312,
					path: '/Firmware_Dev/.pio/build/stm32f407_gateway_v1.4.2_debug.bin',
					size: 512 * 1024,
					mtime: twoDaysAgo,
				},
				{
					id: 19313,
					path: '/CI_Artifacts/nightly/stm32f407_gateway_v1.4.2_nightly.bin',
					size: 512 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1932,
			hash: 'hash-esp32-elf-uf2-hex',
			acknowledged: false,
			files: [
				{
					id: 19321,
					path: '/Firmware_Vault/Production_Releases/ESP32_S3/esp32s3_sensor_v2.1.0_ota_signed.uf2',
					size: 1400 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19322,
					path: '/Firmware_Dev/cmake-build-debug/esp32s3_sensor_v2.1.0_debug.elf',
					size: 1400 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1933,
			hash: 'hash-nrf52-hex-dfu-srec-img',
			acknowledged: false,
			files: [
				{
					id: 19331,
					path: '/Golden_Images/nRF52840/nrf52840_beacon_v1.0.0_factory.hex',
					size: 384 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19332,
					path: '/Staging/nRF52840/nrf52840_beacon_v1.0.0_unsigned.dfu',
					size: 384 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1934,
			hash: 'hash-openwrt-rootfs-img-srec',
			acknowledged: false,
			files: [
				{
					id: 19341,
					path: '/Firmware_Vault/Signed_Releases/IMX8M/imx8m_gateway_v3.0.1_signed.img',
					size: 48 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19342,
					path: '/Build/imx8m_gateway_v3.0.1_staging.srec',
					size: 48 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1935,
			hash: 'hash-kicad-pcb-sources',
			acknowledged: false,
			files: [
				{
					id: 19351,
					path: '/Hardware_Repo/KiCad/RP2040_PowerCtrl/rp2040_power_revB.kicad_pcb',
					size: 820 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19352,
					path: '/Hardware_Repo/KiCad/RP2040_PowerCtrl/RP2040_PowerCtrl-backups/rp2040_power_revB-2026-11-20_101500.kicad_pcb',
					size: 820 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1936,
			hash: 'hash-altium-schdoc-pcbdoc',
			acknowledged: false,
			files: [
				{
					id: 19361,
					path: '/Hardware_Repo/Altium/SensorHub/sensorhub_main.SchDoc',
					size: 640 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19362,
					path: '/Hardware_Repo/Altium/SensorHub/Backup/sensorhub_main.PcbDoc',
					size: 640 * 1024,
					mtime: thirtyDaysAgo,
				},
			],
		},
		{
			id: 1937,
			hash: 'hash-gerber-fab-zip-drl',
			acknowledged: false,
			files: [
				{
					id: 19371,
					path: '/Hardware_Repo/Fab_Release/RP2040_PowerCtrl/rp2040_power_revB_gerbers.zip',
					size: 2200 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19372,
					path: '/Downloads/rp2040_power_revB_gerbers_reexport.zip',
					size: 2200 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1938,
			hash: 'hash-gerber-gbr-drl-layers',
			acknowledged: false,
			files: [
				{
					id: 19381,
					path: '/Hardware_Repo/Gerbers/sensorhub_F_Cu.gbr',
					size: 410 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19382,
					path: '/Scratch/sensorhub_F_Cu_tmp.drl',
					size: 410 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1939,
			hash: 'hash-scope-logic-calibration',
			acknowledged: false,
			files: [
				{
					id: 19391,
					path: '/HW_Lab/Calibration/stm32f407_spi_clock_calib.sr',
					size: 16 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19392,
					path: '/HW_Lab/Scope_Scratch/stm32f407_spi_clock_scratch.sal',
					size: 16 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
				{
					id: 19393,
					path: '/Downloads/stm32f407_spi_clock_raw_dump.vcd',
					size: 16 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1940,
			hash: 'hash-orphan-debug-without-signed',
			acknowledged: false,
			files: [
				{
					id: 19401,
					path: '/Firmware_Dev/build/attiny85_blinker_v0.2.0_debug.bin',
					size: 64 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19402,
					path: '/Firmware_Dev/tmp/attiny85_blinker_v0.2.0_nightly.bin',
					size: 64 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1941,
			hash: 'hash-cwe1236-formula-path',
			acknowledged: false,
			files: [
				{
					id: 19411,
					path: '=CMD("calc")_rp2040_node_v1.0_debug.bin',
					size: 256 * 1024,
					mtime: twoDaysAgo,
				},
				{
					id: 19412,
					path: '/Hardware_Vault/Signed_Releases/RP2040/rp2040_node_v1.0_signed.bin',
					size: 256 * 1024,
					mtime: thirtyDaysAgo,
				},
			],
		},
		{
			id: 1942,
			hash: 'hash-non-hardware-file',
			acknowledged: false,
			files: [
				{
					id: 19421,
					path: '/Documents/Vacation/beach_sunset.jpg',
					size: 3500 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19422,
					path: '/Backups/VM/ubuntu_server_disk.img',
					size: 3500 * 1024,
					mtime: thirtyDaysAgo,
				},
			],
		},
	]
}

describe('Cycle 193: IoT Firmware, Embedded ROM & Hardware Lab Vault Auditor', () => {
	test('classifies all 4 hardware/firmware families and excludes unrelated files', () => {
		const mod = loadIotFirmwareVaultModule()

		assert.equal(
			mod.classifyIotFirmwareFile({ path: '/Releases/stm32f407_fw_v1.4.2_signed.bin', size: 1024 }).family,
			'firmware-rom-images'
		)
		assert.equal(
			mod.classifyIotFirmwareFile({ path: '/Build/esp32s3_app_debug.elf', size: 1024 }).family,
			'firmware-rom-images'
		)
		assert.equal(
			mod.classifyIotFirmwareFile({ path: '/Flash/rp2040_boot.uf2', size: 1024 }).family,
			'firmware-rom-images'
		)
		assert.equal(
			mod.classifyIotFirmwareFile({ path: '/OTA/nrf52840_pkg.dfu', size: 1024 }).family,
			'firmware-rom-images'
		)
		assert.equal(
			mod.classifyIotFirmwareFile({ path: '/Boot/mcu_rom.srec', size: 1024 }).family,
			'firmware-rom-images'
		)
		assert.equal(
			mod.classifyIotFirmwareFile({ path: '/Firmware/gateway_rootfs.img', size: 1024 }).family,
			'firmware-rom-images'
		)
		assert.equal(
			mod.classifyIotFirmwareFile({ path: '/Hardware/board_main.kicad_sch', size: 1024 }).family,
			'eda-kicad-altium-sources'
		)
		assert.equal(
			mod.classifyIotFirmwareFile({ path: '/Hardware/board_main.kicad_pcb', size: 1024 }).family,
			'eda-kicad-altium-sources'
		)
		assert.equal(
			mod.classifyIotFirmwareFile({ path: '/Altium/power.SchDoc', size: 1024 }).family,
			'eda-kicad-altium-sources'
		)
		assert.equal(
			mod.classifyIotFirmwareFile({ path: '/Altium/power.PcbDoc', size: 1024 }).family,
			'eda-kicad-altium-sources'
		)
		assert.equal(
			mod.classifyIotFirmwareFile({ path: '/Fab/top_copper.gbr', size: 1024 }).family,
			'gerber-bom-fab-packages'
		)
		assert.equal(
			mod.classifyIotFirmwareFile({ path: '/Fab/drill_holes.drl', size: 1024 }).family,
			'gerber-bom-fab-packages'
		)
		assert.equal(
			mod.classifyIotFirmwareFile({ path: '/Fab/revA_gerbers.zip', size: 1024 }).family,
			'gerber-bom-fab-packages'
		)
		assert.equal(
			mod.classifyIotFirmwareFile({ path: '/Lab/spi_capture.sr', size: 1024 }).family,
			'lab-scope-logic-captures'
		)
		assert.equal(
			mod.classifyIotFirmwareFile({ path: '/Lab/i2c_bus.sal', size: 1024 }).family,
			'lab-scope-logic-captures'
		)
		assert.equal(
			mod.classifyIotFirmwareFile({ path: '/Lab/uart_timing.vcd', size: 1024 }).family,
			'lab-scope-logic-captures'
		)
		assert.equal(
			mod.classifyIotFirmwareFile({ path: '/Lab/Calibration/oscilloscope_uart_calib.csv', size: 1024 }).family,
			'lab-scope-logic-captures'
		)

		// Unrelated files outside domain
		assert.equal(mod.classifyIotFirmwareFile({ path: '/Photos/sunset.jpg', size: 1024 }).family, null)
		assert.equal(mod.classifyIotFirmwareFile({ path: '/VM/ubuntu_server_disk.img', size: 1024 }).family, null)

		assert.equal(mod.extractHardwareTarget('/Signed_Releases/stm32f407_fw_v1.4.2_signed.bin', 'stm32f407_fw_v1.4.2_signed.bin'), 'STM32F407')
		assert.equal(mod.extractFirmwareVersion('/Signed_Releases/stm32f407_fw_v1.4.2_signed.bin', 'stm32f407_fw_v1.4.2_signed.bin'), 'v1.4.2')
		assert.equal(mod.extractHardwareLineageStem('stm32f407_gateway_v1.4.2_debug.bin'), 'stm32f407_gateway_v1.4.2')
	})

	test('strictly shields signed production releases, KiCad/Altium sources, calibration labs, and unanchored debug builds', () => {
		const mod = loadIotFirmwareVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const result = mod.auditIotFirmwareVault(buildSampleIotFirmwareDuplicates(nowMs), {}, nowMs)

		assert.equal(result.schema, 'duplicatefinder.iot-firmware-vault-auditor.v1')
		assert.equal(result.summary.totalDomainGroupsCount, 11)
		assert.equal(result.summary.totalClustersCount, 11)

		// Signed STM32 release preserved, intermediate debug & nightly reclaimed
		const stm32Cluster = result.clusters.find(c => c.id === 1931)
		assert.ok(stm32Cluster)
		assert.equal(stm32Cluster.hasSignedRelease, true)
		assert.equal(stm32Cluster.hasIntermediateDebugBuild, true)
		const stm32Signed = stm32Cluster.members.find(m => m.normalized.includes('_signed.bin'))
		const stm32Debug = stm32Cluster.members.find(m => m.normalized.includes('_debug.bin'))
		assert.equal(stm32Signed.shielded, true)
		assert.equal(stm32Signed.action, 'keep')
		assert.equal(stm32Debug.shielded, false)
		assert.equal(stm32Debug.action, 'delete')

		// KiCad canonical PCB source shielded, -backups/ timestamp copy reclaimable
		const kicadCluster = result.clusters.find(c => c.id === 1935)
		assert.ok(kicadCluster)
		assert.equal(kicadCluster.hasEdaSource, true)
		const kicadMain = kicadCluster.members.find(m => m.normalized.endsWith('/rp2040_power_revB.kicad_pcb'))
		const kicadBak = kicadCluster.members.find(m => m.normalized.includes('-backups/'))
		assert.equal(kicadMain.shielded, true)
		assert.equal(kicadMain.action, 'keep')
		assert.equal(kicadBak.shielded, false)
		assert.equal(kicadBak.action, 'delete')

		// Calibration lab .sr trace shielded, scratch .sal and .vcd reclaimable
		const labCluster = result.clusters.find(c => c.id === 1939)
		assert.ok(labCluster)
		assert.equal(labCluster.hasCalibrationLab, true)
		const calibSr = labCluster.members.find(m => m.normalized.includes('/Calibration/'))
		const scratchSal = labCluster.members.find(m => m.normalized.includes('Scope_Scratch'))
		assert.equal(calibSr.shielded, true)
		assert.equal(calibSr.action, 'keep')
		assert.equal(scratchSal.shielded, false)
		assert.equal(scratchSal.action, 'delete')

		// Unanchored orphan debug build (attiny85) blocked when requireVerifiedReleaseAnchor is true
		const orphanDebugCluster = result.clusters.find(c => c.id === 1940)
		assert.ok(orphanDebugCluster)
		assert.equal(orphanDebugCluster.hasVerifiedReleaseAnchor, false)
		assert.equal(orphanDebugCluster.reclaimableTargetsCount, 0)
	})

	test('hardlink strategy never hardlinks mutable KiCad/Altium/CSV files and DRY_RUN=1 script, CWE-1236 CSV, manifest, and .sync-exclude.lst are safe', () => {
		const mod = loadIotFirmwareVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleIotFirmwareDuplicates(nowMs)

		const hardlinkAudit = mod.auditIotFirmwareVault(groups, {
			strategy: 'hardlink-immutable-releases',
			requireVerifiedReleaseAnchor: false,
		}, nowMs)

		// Gerber .zip can be hardlinked, while KiCad -backups/ .kicad_pcb (mutable) must not be hardlinked
		const gerberZipCluster = hardlinkAudit.clusters.find(c => c.id === 1937)
		assert.equal(gerberZipCluster.members.find(m => m.normalized.includes('reexport.zip')).action, 'hardlink')

		const kicadCluster = hardlinkAudit.clusters.find(c => c.id === 1935)
		const kicadBak = kicadCluster.members.find(m => m.normalized.includes('-backups/'))
		assert.notEqual(kicadBak.action, 'hardlink')

		// Quarantine script uses DRY_RUN=1 and mv -n
		const quarantineAudit = mod.auditIotFirmwareVault(groups, {
			strategy: 'quarantine-debug-and-captures',
		}, nowMs)
		const script = mod.buildIotFirmwareRemediationScript(quarantineAudit)
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('QUARANTINE_DIR="${QUARANTINE_DIR:-./.iot-firmware-quarantine}"'))
		assert.ok(script.includes('mv -n'))
		assert.equal(script.includes('rp2040_power_revB.kicad_pcb\''), false)

		// CWE-1236 formula injection neutralization in CSV
		const csv = mod.buildIotFirmwareCsvReport(quarantineAudit)
		assert.ok(csv.includes('target_mcu_board,firmware_version,hardware_lineage_stem'))
		assert.ok(!csv.includes(',=CMD('))
		assert.ok(csv.includes('"\'=CMD(""calc"")_rp2040_node_v1.0_debug.bin"'))

		// JSON manifest
		const manifest = JSON.parse(mod.buildIotFirmwareJsonManifest(quarantineAudit))
		assert.equal(manifest.schema, 'duplicatefinder.iot-firmware-vault-auditor.v1')
		assert.equal(manifest.clusters.length, 11)

		// .sync-exclude.lst
		const syncExclude = mod.buildIotFirmwareSyncExcludeList()
		assert.ok(syncExclude.includes('.pio/build/'))
		assert.ok(syncExclude.includes('*-backups/'))
		assert.ok(syncExclude.includes('*_debug.bin'))
	})

	test('IotFirmwareVaultWorkbench renders controls, presets, numeric inputs without mid-keystroke clamping, and clipboard exports', async () => {
		const copied = []
		const Workbench = loadIotFirmwareVaultWorkbench(copied)
		const duplicates = buildSampleIotFirmwareDuplicates()

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const WorkbenchCtor = Vue.extend(Workbench)
		const vm = new WorkbenchCtor({
			propsData: {
				duplicates,
				allDuplicates: duplicates,
				currentDuplicateId: 1931,
			},
		}).$mount(mountNode)

		try {
			await settle()
			assert.ok(vm.$el.classList.contains('iot-firmware-vault-workbench'))
			assert.equal(vm.$el.querySelectorAll('.ifv__cluster-card').length, 11)

			// Controlled numeric inputs must not reset when cleared mid-keystroke
			vm.minSizeKbInput = ''
			await settle()
			assert.equal(vm.minSizeKbInput, '')
			assert.equal(vm.parsedMinSizeKb, 0)

			// Filter by family
			const edaBtn = Array.from(vm.$el.querySelectorAll('.ifv__seg-btn')).find(b => b.textContent.includes('KiCad & Altium EDA Sources'))
			assert.ok(edaBtn)
			edaBtn.click()
			await settle()
			assert.equal(vm.$el.querySelectorAll('.ifv__cluster-card').length, 2)

			// Copy DRY_RUN=1 script & .sync-exclude.lst
			const copyScriptBtn = Array.from(vm.$el.querySelectorAll('.ifv__tool-btn')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			copyScriptBtn.click()
			await settle()
			assert.ok(copied.some(item => item.includes('DRY_RUN="${DRY_RUN:-1}"')))

			const copyExcludeBtn = Array.from(vm.$el.querySelectorAll('.ifv__tool-btn')).find(b => b.textContent.includes('Copy .sync-exclude.lst'))
			copyExcludeBtn.click()
			await settle()
			assert.ok(copied.some(item => item.includes('.pio/build/')))
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue opens and closes IotFirmwareVaultWorkbench with Shift+F4 shortcut and topbar button', async () => {
		window.localStorage.clear()
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const icon = { render: h => h('span') }
		const slotBox = tag => ({ render(h) { return h(tag, this.$slots.default) } })
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'isScanning'],
			render: h => h('div', { class: `stub-${name}` }),
		})

		const SearchBar = loadComponent('src/components/SearchBar.vue', {
			'vue-material-design-icons/ChevronDown': icon,
		})
		const DuplicateListItem = loadComponent('src/components/DuplicateListItem.vue', {
			'@nextcloud/vue': { NcAppNavigationItem: slotBox('div') },
			'@/tools/duplicateStats': loadModule('src/tools/duplicateStats.js'),
			'@/tools/utils': utils,
		})
		const DuplicateNavigation = loadComponent('src/components/DuplicateNavigation.vue', {
			'@nextcloud/vue': {
				NcAppNavigation: { render(h) { return h('nav', this.$scopedSlots.list ? this.$scopedSlots.list() : this.$slots.default) } },
				NcAppNavigationItem: slotBox('div'),
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
			'@/tools/api': { fetchDuplicates: async () => ({ entities: [], pagination: { currentPage: 1, totalPages: 1 } }) },
			'@/tools/utils': utils,
			'@/tools/duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
			'@/tools/duplicatePreferences': loadModule('src/tools/duplicatePreferences.js'),
			'@/tools/duplicateSelectionAndExport': loadModule('src/tools/duplicateSelectionAndExport.js'),
			'@/tools/duplicateSortHelper': loadModule('src/tools/duplicateSortHelper.js'),
			'@/tools/duplicateStats': loadModule('src/tools/duplicateStats.js'),
		})
		const statsModule = loadModule('src/tools/duplicateStats.js')
		const DuplicateTreemap = loadComponent('src/components/DuplicateTreemap.vue', {
			'../tools/duplicateStats': statsModule,
			'../tools/duplicateTreemap': loadModule('src/tools/duplicateTreemap.js', {
				'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
				'./duplicatePathDiff': loadModule('src/tools/duplicatePathDiff.js'),
				'./duplicateStats': statsModule,
			}),
		})

		const IotFirmwareVaultWorkbench = loadIotFirmwareVaultWorkbench()

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
			'./components/DuplicateDetails.vue': { __esModule: true, default: stub('details') },
			'./components/DuplicateTreemap.vue': { __esModule: true, default: DuplicateTreemap },
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('timeline') },
			'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity') },
			'./components/BatchAutoSelectWorkbench.vue': { __esModule: true, default: stub('batch') },
			'./components/FileHygieneInspector.vue': { __esModule: true, default: stub('hygiene') },
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link') },
			'./components/FolderPairMatrix.vue': { __esModule: true, default: stub('matrix') },
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('footprint') },
			'./components/PhotoBurstTimeline.vue': { __esModule: true, default: stub('burst') },
			'./components/RecoverySafetyWorkbench.vue': { __esModule: true, default: stub('safety') },
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
			'./components/VmBackupVaultWorkbench.vue': { __esModule: true, default: stub('vm-backup-vault-auditor') },
			'./components/DbSqlLogVaultWorkbench.vue': { __esModule: true, default: stub('db-sql-log-vault-auditor') },
			'./components/BroadcastNleVaultWorkbench.vue': { __esModule: true, default: stub('broadcast-nle-vault-auditor') },
			'./components/EcommercePimVaultWorkbench.vue': { __esModule: true, default: stub('ecommerce-pim-vault-auditor') },
			'./components/FinanceTaxVaultWorkbench.vue': { __esModule: true, default: stub('finance-tax-vault-auditor') },
			'./components/IotFirmwareVaultWorkbench.vue': { __esModule: true, default: IotFirmwareVaultWorkbench },
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
					entities: type === 'unacknowledged' ? buildSampleIotFirmwareDuplicates() : [],
					pagination: { currentPage: 1, totalPages: 1, totalItems: 12, hasMore: false },
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

			const btn = vm.$el.querySelector('button.topbar-iot-firmware-vault-button')
			assert.ok(btn, 'IoT & Firmware Vault button is rendered in topbar')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Shift+F4')
			assert.equal(vm.$el.querySelector('.iot-firmware-vault-workbench'), null)

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F4', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.ok(vm.$el.querySelector('.iot-firmware-vault-workbench'), 'IotFirmwareVaultWorkbench must open on Shift+F4 shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F4', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.$el.querySelector('.iot-firmware-vault-workbench'), null, 'IotFirmwareVaultWorkbench must toggle closed on Shift+F4 shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new IoT Firmware, Embedded ROM & Hardware Lab Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/iotFirmwareVaultAuditor.js',
			'src/components/IotFirmwareVaultWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `No U+2013/U+2014 in ${rel}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `No XSS sink in ${rel}`)
		}
	})
})
