const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

/**
 * Load the pure Cybersecurity, DFIR Forensics, PCAP & Threat Intel Evidence Vault auditor module.
 *
 * @return {object} Loaded module exports.
 */
function loadDfirSecurityVaultModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateStats': duplicateStats,
	})
	return loadModule('src/tools/dfirSecurityVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

/**
 * Load DfirSecurityVaultWorkbench Vue component with mocked clipboard helper.
 *
 * @param {Array<string>} [copiedPayloads] Array collecting copied strings.
 * @return {object} Loaded Vue component definition.
 */
function loadDfirSecurityVaultWorkbench(copiedPayloads = []) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateStats': duplicateStats,
	})
	const dfirSecurityVaultAuditor = loadModule('src/tools/dfirSecurityVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/DfirSecurityVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async (text) => {
				copiedPayloads.push(text)
				return true
			},
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/dfirSecurityVaultAuditor': dfirSecurityVaultAuditor,
	})
}

/**
 * Build deterministic Cybersecurity, DFIR Forensics, PCAP & Threat Intel duplicate groups.
 *
 * @param {number} [nowMs] Reference epoch milliseconds.
 * @return {Array<object>} Sample duplicate groups.
 */
function buildSampleDfirDuplicates(nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)) {
	const twoDaysAgo = Math.floor((nowMs - 2 * 24 * 60 * 60 * 1000) / 1000)
	const thirtyDaysAgo = Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 1981,
			hash: 'hash-e01-disk-image',
			acknowledged: false,
			files: [
				{
					id: 19811,
					path: '/Evidence_Vault/00_Evidence/IR-2026-041/WS01_SSD.e01',
					size: 4200 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19812,
					path: '/DFIR_Lab/autopsy_cache/IR-2026-041/WS01_SSD.e01',
					size: 4200 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1982,
			hash: 'hash-vmem-memory-dump',
			acknowledged: false,
			files: [
				{
					id: 19821,
					path: '/Evidence_Vault/Chain_of_Custody/IR-2026-041/DC01_ram.vmem',
					size: 2048 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19822,
					path: '/DFIR_Lab/volatility_cache/IR-2026-041/DC01_ram.vmem',
					size: 2048 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1983,
			hash: 'hash-custody-sha256',
			acknowledged: false,
			files: [
				{
					id: 19831,
					path: '/Evidence_Vault/00_Evidence/IR-2026-041/WS01_SSD.e01.sha256',
					size: 16 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19832,
					path: '/Evidence_Vault/Mirror/IR-2026-041/WS01_SSD.e01.sha256',
					size: 16 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1984,
			hash: 'hash-compressed-pcap-anchor',
			acknowledged: false,
			files: [
				{
					id: 19841,
					path: '/Evidence_Vault/PCAP_Archive/perimeter_gw01.pcap.gz',
					size: 750 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19842,
					path: '/DFIR_Lab/pcap_extracted/perimeter_gw01.pcap.gz',
					size: 750 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1985,
			hash: 'hash-redundant-uncompressed-pcap',
			acknowledged: false,
			files: [
				{
					id: 19851,
					path: '/DFIR_Lab/carved_tmp/perimeter_gw01.pcap',
					size: 3100 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19852,
					path: '/SOC_Triage/Suricata/perimeter_gw01_raw.pcap',
					size: 3100 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1986,
			hash: 'hash-uncompressed-pcap-no-anchor',
			acknowledged: false,
			files: [
				{
					id: 19861,
					path: '/SOC_Triage/Isolated_VLAN/vlan99_capture.pcapng',
					size: 420 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19862,
					path: '/SOC_Triage/Mirror/vlan99_capture.pcapng',
					size: 420 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1987,
			hash: 'hash-yara-stix-quarantine',
			acknowledged: false,
			files: [
				{
					id: 19871,
					path: '/Threat_Intel/YARA/apt_beacon_2026.yara',
					size: 128 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19872,
					path: '/Threat_Intel/Mirror/apt_beacon_2026.yara',
					size: 128 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1988,
			hash: 'hash-malware-quarantine-enc',
			acknowledged: false,
			files: [
				{
					id: 19881,
					path: '/Quarantine_Vault/IR-2026-041/payload_dropper.zip.enc',
					size: 24 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19882,
					path: '/Quarantine_Vault/Backup/IR-2026-041/payload_dropper.zip.enc',
					size: 24 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1989,
			hash: 'hash-evtx-and-plaso-scratch',
			acknowledged: false,
			files: [
				{
					id: 19891,
					path: '/Evidence_Vault/SIEM_Cold/DC01_Security.evtx',
					size: 180 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19892,
					path: '/DFIR_Lab/kape_staging/DC01_Security.evtx',
					size: 180 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1990,
			hash: 'hash-plaso-timeline-scratch',
			acknowledged: false,
			files: [
				{
					id: 19901,
					path: '/DFIR_Lab/plaso_tmp/ir_2026_041_timeline.plaso',
					size: 640 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19902,
					path: '/DFIR_Lab/volatility_cache/ir_2026_041_timeline.plaso',
					size: 640 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1991,
			hash: 'hash-unrelated-photo-raw',
			acknowledged: false,
			files: [
				{
					id: 19911,
					path: '/Photos/2026/Studio/IMG_1024.raw',
					size: 48 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19912,
					path: '/Photos/Backup/IMG_1024.raw',
					size: 48 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
	]
}

describe('Cycle 198: Cybersecurity, DFIR Forensics, PCAP & Threat Intel Evidence Vault Auditor', () => {
	test('classifies E01/VMEM forensics, PCAP/PCAP.GZ captures, YARA/quarantine, and SIEM/Plaso scratch while ignoring unrelated files', () => {
		const { classifyDfirSecurityFile, auditDfirSecurityVault, DFIR_SECURITY_VAULT_SCHEMA } = loadDfirSecurityVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)

		assert.equal(classifyDfirSecurityFile({ path: '/Evidence/IR-01/disk.e01', size: 100 }, nowMs).family, 'disk-memory-forensics')
		assert.equal(classifyDfirSecurityFile({ path: '/Evidence/IR-01/ram.vmem', size: 100 }, nowMs).family, 'disk-memory-forensics')
		assert.equal(classifyDfirSecurityFile({ path: '/Captures/gw01.pcap.gz', size: 100 }, nowMs).family, 'network-pcap-telemetry')
		assert.equal(classifyDfirSecurityFile({ path: '/Intel/rules.yara', size: 100 }, nowMs).family, 'malware-ioc-threat-intel')
		assert.equal(classifyDfirSecurityFile({ path: '/Quarantine/sample.zip.enc', size: 100 }, nowMs).family, 'malware-ioc-threat-intel')
		assert.equal(classifyDfirSecurityFile({ path: '/SIEM/Security.evtx', size: 100 }, nowMs).family, 'siem-carving-scratch')
		assert.equal(classifyDfirSecurityFile({ path: '/DFIR_Lab/plaso_tmp/case.plaso', size: 100 }, nowMs).family, 'siem-carving-scratch')
		assert.equal(classifyDfirSecurityFile({ path: '/Photos/2026/Studio/IMG_1024.raw', size: 100 }, nowMs).family, null)
		assert.equal(classifyDfirSecurityFile({ path: '/Documents/report.docx', size: 100 }, nowMs).family, null)

		const audit = auditDfirSecurityVault(buildSampleDfirDuplicates(nowMs), {}, nowMs)
		assert.equal(audit.schema, DFIR_SECURITY_VAULT_SCHEMA)
		assert.equal(audit.summary.totalDomainGroupsCount, 10)
		assert.equal(audit.familyCounts['disk-memory-forensics'], 3)
		assert.equal(audit.familyCounts['network-pcap-telemetry'], 3)
		assert.equal(audit.familyCounts['malware-ioc-threat-intel'], 2)
		assert.equal(audit.familyCounts['siem-carving-scratch'], 2)
	})

	test('strictly conserves E01/VMEM, PCAP.GZ, YARA/Quarantine, and EVTX while reclaiming redundant .pcap backed by .pcap.gz and carving scratch', () => {
		const { auditDfirSecurityVault, buildDfirSecurityRemediationScript } = loadDfirSecurityVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const audit = auditDfirSecurityVault(buildSampleDfirDuplicates(nowMs), {}, nowMs)

		const e01Cluster = audit.clusters.find(c => c.id === 1981)
		assert.ok(e01Cluster)
		assert.equal(e01Cluster.hasProtectedForensicImage, true)
		assert.equal(e01Cluster.members[0].shielded, true)
		assert.equal(e01Cluster.members[0].action, 'keep')
		// Scratch copy in autopsy_cache/ is reclaimable while canonical E01 is strictly conserved
		assert.equal(e01Cluster.members[1].isCarvingScratchPath, true)
		assert.equal(e01Cluster.members[1].action, 'delete')

		const redundantPcapCluster = audit.clusters.find(c => c.id === 1985)
		assert.ok(redundantPcapCluster)
		assert.equal(redundantPcapCluster.clusterVerdict, 'uncompressed-pcap-redundant')
		assert.equal(redundantPcapCluster.hasCompressedPcapAnchor, true)
		assert.equal(redundantPcapCluster.members.every(m => m.action === 'delete'), true)

		const unanchoredPcapCluster = audit.clusters.find(c => c.id === 1986)
		assert.ok(unanchoredPcapCluster)
		assert.equal(unanchoredPcapCluster.hasCompressedPcapAnchor, false)
		// Guard blocks pruning uncompressed pcapng lacking a verified .pcap.gz/.zst anchor
		assert.equal(unanchoredPcapCluster.members.every(m => m.shielded && m.action === 'keep'), true)

		const quarantineCluster = audit.clusters.find(c => c.id === 1988)
		assert.ok(quarantineCluster)
		assert.equal(quarantineCluster.hasProtectedThreatIntelOrQuarantine, true)
		assert.equal(quarantineCluster.members.every(m => m.shielded && m.action === 'keep'), true)

		const plasoCluster = audit.clusters.find(c => c.id === 1990)
		assert.ok(plasoCluster)
		assert.equal(plasoCluster.clusterVerdict, 'carving-scratch-intermediate')
		assert.equal(plasoCluster.reclaimableTargetsCount, 1)

		const script = buildDfirSecurityRemediationScript(audit)
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('perimeter_gw01.pcap'))
		assert.ok(script.includes('/DFIR_Lab/autopsy_cache/IR-2026-041/WS01_SSD.e01'))
		assert.equal(script.includes("rm -f '/Evidence_Vault/00_Evidence/IR-2026-041/WS01_SSD.e01'"), false)
		assert.equal(script.includes('payload_dropper.zip.enc'), false)
	})

	test('respects incident grace window and never hardlinks mutable YARA/Quarantine/PCAP/EVTX files', () => {
		const { auditDfirSecurityVault, buildDfirSecurityRemediationScript } = loadDfirSecurityVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)

		const recentAudit = auditDfirSecurityVault(buildSampleDfirDuplicates(nowMs), {
			presetId: 'carving-volatility-scratch-cleanup',
			keepRecentIncidentDays: 14,
		}, nowMs)
		const plasoCluster = recentAudit.clusters.find(c => c.id === 1990)
		assert.ok(plasoCluster)
		// Two-days-old volatility_cache/ copy is shielded within 14-day incident retention window
		const recentCopy = plasoCluster.members.find(m => m.normalized.includes('volatility_cache'))
		assert.equal(recentCopy.shielded, true)
		assert.equal(recentCopy.action, 'keep')

		// Even with hardlink strategy and shields turned off, mutable files (.yara, .zip.enc, .evtx, .pcap) must never be hardlinked
		const hardlinkAudit = auditDfirSecurityVault(buildSampleDfirDuplicates(nowMs), {
			strategy: 'hardlink-archived-forensics-and-pcap',
			protectForensicEvidenceImages: false,
			protectCompressedPcapAndSiem: false,
			protectThreatIntelAndQuarantine: false,
		}, nowMs)

		const yaraCluster = hardlinkAudit.clusters.find(c => c.id === 1987)
		const quarantineCluster = hardlinkAudit.clusters.find(c => c.id === 1988)
		const evtxCluster = hardlinkAudit.clusters.find(c => c.id === 1989)
		assert.equal(yaraCluster.members.some(m => m.action === 'hardlink'), false)
		assert.equal(quarantineCluster.members.some(m => m.action === 'hardlink'), false)
		assert.equal(evtxCluster.members.some(m => m.action === 'hardlink'), false)

		// Immutable .e01.sha256 manifest in non-scratch Mirror can be hardlinked safely
		const hashCluster = hardlinkAudit.clusters.find(c => c.id === 1983)
		assert.equal(hashCluster.members.some(m => m.action === 'hardlink'), true)
		const script = buildDfirSecurityRemediationScript(hardlinkAudit)
		assert.ok(script.includes('ln -f '))
	})

	test('generates CWE-1236 formula-safe CSV, deterministic JSON manifest, and .sync-exclude.lst rules', () => {
		const {
			auditDfirSecurityVault,
			buildDfirSecurityCsvReport,
			buildDfirSecurityJsonManifest,
			buildDfirSecuritySyncExcludeList,
			DFIR_SECURITY_VAULT_SCHEMA,
		} = loadDfirSecurityVaultModule()

		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const formulaGroups = [
			{
				id: '=cmd|calc!',
				hash: 'hash-formula',
				files: [
					{ id: 1, path: '=cmd|calc!/evil.pcap.gz', size: 1024 * 1024, mtime: 1700000000 },
					{ id: 2, path: '+SUM(A1)/carved_tmp/evil.pcap', size: 2048 * 1024, mtime: 1700001000 },
				],
			},
		]

		const audit = auditDfirSecurityVault(formulaGroups, {}, nowMs)
		const csv = buildDfirSecurityCsvReport(audit)
		assert.ok(csv.includes('\'=cmd|calc!'))
		assert.ok(csv.includes('\'+SUM(A1)'))

		const manifest = JSON.parse(buildDfirSecurityJsonManifest(audit))
		assert.equal(manifest.schema, DFIR_SECURITY_VAULT_SCHEMA)
		assert.equal(manifest.clusters.length, 1)

		const syncExclude = buildDfirSecuritySyncExcludeList()
		assert.ok(syncExclude.includes('volatility_cache/'))
		assert.ok(syncExclude.includes('plaso_tmp/'))
		assert.ok(syncExclude.includes('carved_tmp/'))
	})

	test('DfirSecurityVaultWorkbench renders KPIs, presets, shield toggles, filters, per-copy overrides, and copy actions cleanly', async () => {
		const copied = []
		const Workbench = loadDfirSecurityVaultWorkbench(copied)
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)

		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: buildSampleDfirDuplicates(),
					allDuplicates: buildSampleDfirDuplicates(),
					currentDuplicateId: 1985,
				},
			}),
		}).$mount(mountNode)

		try {
			await settle()
			const rootEl = vm.$el
			assert.ok(rootEl.classList.contains('dfir-security-vault-workbench'))
			assert.equal(rootEl.querySelectorAll('.dsv__kpi').length, 4)
			assert.ok(rootEl.querySelectorAll('.dsv__cluster-card').length >= 5)

			// Preset switching filters to Network PCAP & Captures
			const presetBtns = Array.from(rootEl.querySelectorAll('.dsv__seg-btn'))
			const pcapPresetBtn = presetBtns.find(b => b.textContent.includes('Redundant Uncompressed .pcap'))
			assert.ok(pcapPresetBtn)
			pcapPresetBtn.click()
			await settle()
			assert.equal(rootEl.querySelectorAll('.dsv__cluster-card').length, 3)

			// Copy script and .sync-exclude.lst
			const copyScriptBtn = Array.from(rootEl.querySelectorAll('.dsv__tool-btn')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			copyScriptBtn.click()
			await settle()
			assert.equal(copied.length, 1)
			assert.ok(copied[0].includes('DRY_RUN='))

			const copyExcludeBtn = Array.from(rootEl.querySelectorAll('.dsv__tool-btn')).find(b => b.textContent.includes('Copy .sync-exclude.lst'))
			copyExcludeBtn.click()
			await settle()
			assert.equal(copied.length, 2)
			assert.ok(copied[1].includes('volatility_cache/'))
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('DfirSecurityVaultWorkbench renders empty-state banner when no duplicates are loaded', async () => {
		const Workbench = loadDfirSecurityVaultWorkbench()
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: [],
					allDuplicates: [],
				},
			}),
		}).$mount(mountNode)

		try {
			await settle()
			assert.ok(vm.$el.querySelector('.dsv__empty-banner'))
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue opens and closes DfirSecurityVaultWorkbench via Shift+F11 and topbar button', async () => {
		window.localStorage.clear()
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'isScanning'],
			render(h) {
				return h('div', { attrs: { 'data-stub': name } })
			},
		})
		const slotBox = tag => ({ render(h) { return h(tag, {}, this.$slots.default) } })
		const icon = { render: h => h('span') }

		const statsModule = loadModule('src/tools/duplicateStats.js')
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const SearchBar = loadComponent('src/components/SearchBar.vue', {
			'vue-material-design-icons/ChevronDown': icon,
		})
		const DuplicateListItem = loadComponent('src/components/DuplicateListItem.vue', {
			'@nextcloud/vue': { NcAppNavigationItem: slotBox('div') },
			'@/tools/duplicateStats': statsModule,
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
			'@/tools/duplicateStats': statsModule,
		})
		const DuplicateTreemap = loadComponent('src/components/DuplicateTreemap.vue', {
			'../tools/duplicateStats': statsModule,
			'../tools/duplicateTreemap': loadModule('src/tools/duplicateTreemap.js', {
				'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
				'./duplicatePathDiff': loadModule('src/tools/duplicatePathDiff.js'),
				'./duplicateStats': statsModule,
			}),
		})
		const DfirSecurityVaultWorkbench = loadDfirSecurityVaultWorkbench()

		const App = loadComponent('src/App.vue', {
			'@nextcloud/dialogs': { showError: () => {}, showSuccess: () => {} },
			'@nextcloud/vue': {
				NcAppContent: slotBox('div'),
				NcAppNavigation: slotBox('div'),
				NcAppNavigationItem: slotBox('li'),
				NcAppNavigationList: slotBox('ul'),
				NcAppNavigationNew: slotBox('div'),
				NcAppSidebar: slotBox('aside'),
				NcEmptyContent: slotBox('div'),
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
			'./components/IotFirmwareVaultWorkbench.vue': { __esModule: true, default: stub('iot-firmware-vault-auditor') },
			'./components/MobileBuildVaultWorkbench.vue': { __esModule: true, default: stub('mobile-build-vault-auditor') },
			'./components/K8sTerraformVaultWorkbench.vue': { __esModule: true, default: stub('k8s-terraform-vault-auditor') },
			'./components/PublishingPrepressVaultWorkbench.vue': { __esModule: true, default: stub('publishing-prepress-vault-auditor') },
			'./components/GenomicsBioinformaticsVaultWorkbench.vue': { __esModule: true, default: stub('genomics-bioinformatics-vault-auditor') },
			'./components/DfirSecurityVaultWorkbench.vue': { __esModule: true, default: DfirSecurityVaultWorkbench },
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
					entities: type === 'unacknowledged' ? buildSampleDfirDuplicates() : [],
					pagination: { currentPage: 1, totalPages: 1, totalItems: 11, hasMore: false },
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

			const btn = vm.$el.querySelector('button.topbar-dfir-security-vault-button')
			assert.ok(btn, 'DFIR & Security Vault button is rendered in topbar')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Shift+F11')
			assert.equal(vm.$el.querySelector('.dfir-security-vault-workbench'), null)

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F11', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.ok(vm.$el.querySelector('.dfir-security-vault-workbench'), 'DfirSecurityVaultWorkbench must open on Shift+F11 shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F11', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.$el.querySelector('.dfir-security-vault-workbench'), null, 'DfirSecurityVaultWorkbench must toggle closed on Shift+F11 shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new DFIR & Security Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/dfirSecurityVaultAuditor.js',
			'src/components/DfirSecurityVaultWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `No U+2013/U+2014 in ${rel}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `No XSS sink in ${rel}`)
		}
	})
})
