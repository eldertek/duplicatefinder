const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

/**
 * Load the pure Broadcast Video, NLE Proxy & Camera Card Media Vault auditor module.
 *
 * @return {object} Loaded module exports.
 */
function loadBroadcastNleVaultModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateStats': duplicateStats,
	})
	return loadModule('src/tools/broadcastNleVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

/**
 * Load BroadcastNleVaultWorkbench Vue component with mocked clipboard helper.
 *
 * @param {Array<string>} [copiedPayloads] Array collecting copied strings.
 * @return {object} Loaded Vue component definition.
 */
function loadBroadcastNleVaultWorkbench(copiedPayloads = []) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateStats': duplicateStats,
	})
	const broadcastNleVaultAuditor = loadModule('src/tools/broadcastNleVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/BroadcastNleVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async (text) => {
				copiedPayloads.push(text)
				return true
			},
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/broadcastNleVaultAuditor': broadcastNleVaultAuditor,
	})
}

/**
 * Build deterministic broadcast rushes, camera card offloads, NLE proxies/caches,
 * project timelines, and master export duplicate clusters.
 *
 * @param {number} [nowMs] Reference epoch milliseconds.
 * @return {Array<object>} Sample duplicate groups.
 */
function buildSampleBroadcastNleDuplicates(nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)) {
	const oneDayAgo = Math.floor((nowMs - 1 * 24 * 60 * 60 * 1000) / 1000)
	const tenDaysAgo = Math.floor((nowMs - 10 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 1901,
			hash: 'hash-red-r3d-card-offload',
			acknowledged: false,
			files: [
				{
					id: 19011,
					path: '/MediaVault/OCF/Day01/CFexpress_A001/A001C004_240510_R1AB.r3d',
					size: 8 * 1024 * 1024 * 1024,
					mtime: tenDaysAgo,
				},
				{
					id: 19012,
					path: '/Ingest_Scratch/Offload_2/CFexpress_A001/A001C004_240510_R1AB.r3d',
					size: 8 * 1024 * 1024 * 1024,
					mtime: oneDayAgo,
				},
			],
		},
		{
			id: 1902,
			hash: 'hash-braw-avchd-dual-vault',
			acknowledged: false,
			files: [
				{
					id: 19021,
					path: '/MediaVault/Rushes/CamB/B002_1120_C001.braw',
					size: 4 * 1024 * 1024 * 1024,
					mtime: tenDaysAgo,
				},
				{
					id: 19022,
					path: '/Camera_Originals/Day02/B002_1120_C001.braw',
					size: 4 * 1024 * 1024 * 1024,
					mtime: tenDaysAgo,
				},
			],
		},
		{
			id: 1903,
			hash: 'hash-avchd-sd-card-offload',
			acknowledged: false,
			files: [
				{
					id: 19031,
					path: '/MediaVault/Rushes/SD_Card_03/PRIVATE/AVCHD/BDMV/STREAM/00012.mts',
					size: 1200 * 1024 * 1024,
					mtime: tenDaysAgo,
				},
				{
					id: 19032,
					path: '/Downloads/SD_Backup_2/PRIVATE/AVCHD/BDMV/STREAM/00012.mts',
					size: 1200 * 1024 * 1024,
					mtime: oneDayAgo,
				},
			],
		},
		{
			id: 1904,
			hash: 'hash-nle-proxy-cacheclip',
			acknowledged: false,
			files: [
				{
					id: 19041,
					path: '/EditSuite/Resolve/Proxy/A001C004_240510_R1AB_Proxy.mov',
					size: 600 * 1024 * 1024,
					mtime: oneDayAgo,
				},
				{
					id: 19042,
					path: '/EditSuite/Resolve/Optimized Media/A001C004_240510_R1AB_Proxy.mov',
					size: 600 * 1024 * 1024,
					mtime: oneDayAgo,
				},
			],
		},
		{
			id: 1905,
			hash: 'hash-premiere-pek-cfa-cache',
			acknowledged: false,
			files: [
				{
					id: 19051,
					path: '/EditSuite/Premiere/Adobe Premiere Pro Video Previews/Seq01.pek',
					size: 128 * 1024 * 1024,
					mtime: oneDayAgo,
				},
				{
					id: 19052,
					path: '/EditSuite/Premiere/CacheClip/Seq01.cfa',
					size: 128 * 1024 * 1024,
					mtime: oneDayAgo,
				},
			],
		},
		{
			id: 1906,
			hash: 'hash-nle-project-drp-prproj',
			acknowledged: false,
			files: [
				{
					id: 19061,
					path: '/EditSuite/Projects/Feature_Doc_v4.drp',
					size: 48 * 1024 * 1024,
					mtime: oneDayAgo,
				},
				{
					id: 19062,
					path: '/EditSuite/Projects/Archive/Feature_Doc_v4.drp',
					size: 48 * 1024 * 1024,
					mtime: tenDaysAgo,
				},
			],
		},
		{
			id: 1907,
			hash: 'hash-nle-project-autosave',
			acknowledged: false,
			files: [
				{
					id: 19071,
					path: '/EditSuite/Projects/Documentary_Edit.prproj',
					size: 32 * 1024 * 1024,
					mtime: oneDayAgo,
				},
				{
					id: 19072,
					path: '/EditSuite/Adobe Premiere Pro Auto-Save/Documentary_Edit.prproj',
					size: 32 * 1024 * 1024,
					mtime: tenDaysAgo,
				},
			],
		},
		{
			id: 1908,
			hash: 'hash-broadcast-master-prores',
			acknowledged: false,
			files: [
				{
					id: 19081,
					path: '/Broadcast/Masters/Show_Ep01_ProRes422HQ_MASTER.mov',
					size: 10 * 1024 * 1024 * 1024,
					mtime: oneDayAgo,
				},
				{
					id: 19082,
					path: '/Downloads/Show_Ep01_ProRes422HQ_MASTER.mov',
					size: 10 * 1024 * 1024 * 1024,
					mtime: oneDayAgo,
				},
			],
		},
		{
			id: 1909,
			hash: 'hash-unrelated-photo',
			acknowledged: false,
			files: [
				{
					id: 19091,
					path: '/Personal/Photos/holiday.jpg',
					size: 4 * 1024 * 1024,
					mtime: oneDayAgo,
				},
				{
					id: 19092,
					path: '/Personal/Photos/Backup/holiday.jpg',
					size: 4 * 1024 * 1024,
					mtime: oneDayAgo,
				},
			],
		},
	]
}

describe('Cycle 190: Broadcast Video, NLE Proxy & Camera Card Media Vault Auditor', () => {
	test('classifies camera rushes, card trees, NLE proxies/caches, projects/timelines, and broadcast masters while excluding unrelated files', () => {
		const mod = loadBroadcastNleVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)

		const r3d = mod.classifyBroadcastNleFile({ path: '/MediaVault/OCF/CFexpress_A001/A001C001.r3d', size: 1024 }, nowMs)
		assert.equal(r3d.family, 'camera-rushes-card-offloads')
		assert.equal(r3d.artifactKind, 'camera-raw-ocf')
		assert.equal(r3d.cardSignature, 'CFexpress_A001')

		const mxf = mod.classifyBroadcastNleFile({ path: '/Rushes/XDROOT/Clip/C0012.mxf', size: 1024 }, nowMs)
		assert.equal(mxf.family, 'camera-rushes-card-offloads')
		assert.equal(mxf.artifactKind, 'broadcast-mxf-rush')

		const xavc = mod.classifyBroadcastNleFile({ path: '/Rushes/M4ROOT/CLIP/C0004.mp4', size: 1024 }, nowMs)
		assert.equal(xavc.family, 'camera-rushes-card-offloads')

		const proxy = mod.classifyBroadcastNleFile({ path: '/Edit/Proxy/A001C001_Proxy.mov', size: 1024 }, nowMs)
		assert.equal(proxy.family, 'nle-proxies-render-caches')
		assert.equal(proxy.isRegenerableProxyOrCache, true)

		const pek = mod.classifyBroadcastNleFile({ path: '/Edit/Adobe Premiere Pro Video Previews/Seq01.pek', size: 1024 }, nowMs)
		assert.equal(pek.family, 'nle-proxies-render-caches')
		assert.equal(pek.artifactKind, 'nle-peak-or-cache')

		const fcpxml = mod.classifyBroadcastNleFile({ path: '/Projects/Main_Timeline.fcpxml', size: 1024 }, nowMs)
		assert.equal(fcpxml.family, 'nle-projects-timelines')
		assert.equal(fcpxml.isMutableNleProject, true)

		const aep = mod.classifyBroadcastNleFile({ path: '/Projects/Titles.aep', size: 1024 }, nowMs)
		assert.equal(aep.family, 'nle-projects-timelines')

		const xml = mod.classifyBroadcastNleFile({ path: '/Projects/Resolve/Timeline_Reel1.xml', size: 1024 }, nowMs)
		assert.equal(xml.family, 'nle-projects-timelines')

		const master = mod.classifyBroadcastNleFile({ path: '/Masters/TX/Documentary_FINAL.mov', size: 1024 }, nowMs)
		assert.equal(master.family, 'broadcast-master-exports')

		const unrelated = mod.classifyBroadcastNleFile({ path: '/Users/alice/Downloads/movie-trailer.mp4', size: 1024 }, nowMs)
		assert.equal(unrelated.family, null)
	})

	test('strictly protects canonical OCF rushes, NLE projects/timelines, and broadcast masters while reclaiming duplicate card offloads and regenerable proxies/caches', () => {
		const mod = loadBroadcastNleVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleBroadcastNleDuplicates(nowMs)

		const audit = mod.auditBroadcastNleVault(groups, {}, nowMs)
		assert.equal(audit.schema, mod.BROADCAST_NLE_VAULT_SCHEMA)
		assert.equal(audit.summary.totalDomainGroupsCount, 8)
		assert.equal(audit.familyCounts['camera-rushes-card-offloads'], 3)
		assert.equal(audit.familyCounts['nle-proxies-render-caches'], 2)
		assert.equal(audit.familyCounts['nle-projects-timelines'], 2)
		assert.equal(audit.familyCounts['broadcast-master-exports'], 1)

		// Cluster 1901: R3D canonical OCF conserved, secondary Offload_2 reclaimed
		const r3dCluster = audit.clusters.find(c => c.id === 1901)
		assert.ok(r3dCluster)
		assert.equal(r3dCluster.hasVerifiedOcfAnchor, true)
		assert.equal(r3dCluster.members.find(m => m.id === 19011).action, 'keep')
		assert.equal(r3dCluster.members.find(m => m.id === 19011).shielded, true)
		assert.equal(r3dCluster.members.find(m => m.id === 19012).action, 'delete')
		assert.equal(r3dCluster.members.find(m => m.id === 19012).governanceTier, 'card-offload-duplicate')

		// Cluster 1902: Both BRAW copies in canonical OCF/Rushes vaults -> strictly conserved
		const brawCluster = audit.clusters.find(c => c.id === 1902)
		assert.ok(brawCluster)
		assert.equal(brawCluster.reclaimableTargetsCount, 0)
		assert.ok(brawCluster.members.every(m => m.action === 'keep' && m.shielded))

		// Cluster 1903: AVCHD SD card canonical conserved, Downloads/SD_Backup_2 reclaimed
		const avchdCluster = audit.clusters.find(c => c.id === 1903)
		assert.ok(avchdCluster)
		assert.equal(avchdCluster.members.find(m => m.id === 19031).action, 'keep')
		assert.equal(avchdCluster.members.find(m => m.id === 19032).action, 'delete')

		// Cluster 1904 & 1905: Regenerable NLE proxies & .pek/.cfa caches reclaimable
		const proxyCluster = audit.clusters.find(c => c.id === 1904)
		assert.ok(proxyCluster)
		assert.equal(proxyCluster.reclaimableTargetsCount, 2)
		const cacheCluster = audit.clusters.find(c => c.id === 1905)
		assert.ok(cacheCluster)
		assert.equal(cacheCluster.reclaimableTargetsCount, 2)

		// Cluster 1906: .drp project copies both outside autosave -> strictly conserved
		const drpCluster = audit.clusters.find(c => c.id === 1906)
		assert.ok(drpCluster)
		assert.equal(drpCluster.reclaimableTargetsCount, 0)
		assert.ok(drpCluster.members.every(m => m.action === 'keep' && m.shielded))

		// Cluster 1907: .prproj main kept, Auto-Save scratch reclaimed
		const prprojCluster = audit.clusters.find(c => c.id === 1907)
		assert.ok(prprojCluster)
		assert.equal(prprojCluster.members.find(m => m.id === 19071).action, 'keep')
		assert.equal(prprojCluster.members.find(m => m.id === 19072).action, 'delete')

		// Cluster 1908: Master export conserved in /Broadcast/Masters/, Downloads duplicate reclaimed
		const masterCluster = audit.clusters.find(c => c.id === 1908)
		assert.ok(masterCluster)
		assert.equal(masterCluster.members.find(m => m.id === 19081).action, 'keep')
		assert.equal(masterCluster.members.find(m => m.id === 19082).action, 'delete')
	})

	test('hardlink strategy consolidates camera rushes and masters while strictly blocking hardlinks on mutable NLE projects', () => {
		const mod = loadBroadcastNleVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleBroadcastNleDuplicates(nowMs)

		const audit = mod.auditBroadcastNleVault(groups, {
			strategy: 'hardlink-camera-rushes-vault',
		}, nowMs)

		const drpCluster = audit.clusters.find(c => c.id === 1906)
		assert.equal(drpCluster.hardlinkTargetsCount, 0)
		assert.ok(drpCluster.members.every(m => m.action === 'keep'))

		const brawCluster = audit.clusters.find(c => c.id === 1902)
		assert.equal(brawCluster.hardlinkTargetsCount, 1)
		assert.ok(brawCluster.members.some(m => m.action === 'hardlink'))
	})

	test('generates safe DRY_RUN=1 script, CWE-1236 CSV, JSON manifest, and .sync-exclude.lst rules', () => {
		const mod = loadBroadcastNleVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = [
			{
				id: 1950,
				hash: 'hash-cwe-test',
				files: [
					{ id: 19501, path: '/MediaVault/OCF/Day01/A001C001.r3d', size: 1024 * 1024, mtime: Math.floor(nowMs / 1000) },
					{ id: 19502, path: '/Ingest_Scratch/Offload_2/=cmd|calc!A0.r3d', size: 1024 * 1024, mtime: Math.floor(nowMs / 1000) },
				],
			},
		]

		const audit = mod.auditBroadcastNleVault(groups, {}, nowMs)
		const script = mod.buildBroadcastNleRemediationScript(audit)
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes("run_cmd rm -f '/Ingest_Scratch/Offload_2/=cmd|calc!A0.r3d'"))
		assert.ok(!script.includes("rm -f '/MediaVault/OCF/Day01/A001C001.r3d'"))

		const csv = mod.buildBroadcastNleCsvReport(audit)
		assert.ok(csv.includes('cluster_id,cluster_name,clip_stem'))

		// Direct formula-start cell check for CWE-1236
		const formulaAudit = mod.auditBroadcastNleVault([
			{
				id: 1951,
				hash: 'hash-formula',
				files: [
					{ id: 19511, path: '=HYPERLINK("http://evil")/Proxy/clip.mov', size: 2048, mtime: Math.floor(nowMs / 1000) },
					{ id: 19512, path: '/EditSuite/Proxy/clip.mov', size: 2048, mtime: Math.floor(nowMs / 1000) },
				],
			},
		], {}, nowMs)
		const formulaCsv = mod.buildBroadcastNleCsvReport(formulaAudit)
		assert.ok(formulaCsv.includes("'=HYPERLINK"))

		const json = JSON.parse(mod.buildBroadcastNleJsonManifest(audit))
		assert.equal(json.schema, mod.BROADCAST_NLE_VAULT_SCHEMA)
		assert.equal(json.clusters.length, 1)

		const syncExclude = mod.buildBroadcastNleSyncExcludeList()
		assert.ok(syncExclude.includes('Proxy/'))
		assert.ok(syncExclude.includes('Optimized Media/'))
		assert.ok(syncExclude.includes('CacheClip/'))
		assert.ok(syncExclude.includes('Adobe Premiere Pro Video Previews/'))
		assert.ok(syncExclude.includes('*.pek'))
		assert.ok(syncExclude.includes('*.cfa'))
	})

	test('BroadcastNleVaultWorkbench.vue renders empty/populated states, handles non-clamping inputs, and emits actions cleanly', async () => {
		const copied = []
		const Workbench = loadBroadcastNleVaultWorkbench(copied)

		// Empty state
		const emptyNode = document.createElement('div')
		document.body.appendChild(emptyNode)
		const emptyVm = new Vue({
			render: h => h(Workbench, {
				props: { duplicates: [], allDuplicates: [] },
			}),
		}).$mount(emptyNode)
		try {
			await settle()
			assert.ok(emptyVm.$el.querySelector('.bnlv__empty-banner'))
		} finally {
			emptyVm.$destroy()
			emptyNode.remove()
		}

		// Populated state
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const duplicates = buildSampleBroadcastNleDuplicates(nowMs)
		const selectedEvents = []
		const comparedEvents = []

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const host = new Vue({
			data() {
				return { duplicates }
			},
			render(h) {
				return h(Workbench, {
					props: { duplicates: this.duplicates, allDuplicates: this.duplicates },
					on: {
						'select-duplicate': d => selectedEvents.push(d),
						'compare-duplicate': d => comparedEvents.push(d),
					},
				})
			},
		}).$mount(mountNode)

		try {
			await settle()
			const wb = host.$children[0]
			assert.ok(wb.$el.querySelector('.bnlv__workspace'))
			assert.ok(wb.$el.querySelectorAll('.bnlv__cluster-card').length >= 6)

			// Numeric input must not clamp mid-keystroke
			wb.keepRecentCacheDaysInput = ''
			await settle()
			assert.equal(wb.keepRecentCacheDaysInput, '')
			assert.equal(wb.parsedKeepRecentCacheDays, 0)

			// Copy DRY_RUN=1 script
			const copyScriptBtn = Array.from(wb.$el.querySelectorAll('button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			assert.ok(copyScriptBtn)
			copyScriptBtn.click()
			await settle()
			assert.equal(copied.length, 1)
			assert.ok(copied[0].includes('DRY_RUN='))

			// Jump & Compare actions
			const triageBtn = Array.from(wb.$el.querySelectorAll('button')).find(b => b.textContent.includes('Open in Triage'))
			const compareBtn = Array.from(wb.$el.querySelectorAll('button')).find(b => b.textContent.includes('Side-by-Side'))
			triageBtn.click()
			compareBtn.click()
			await settle()
			assert.equal(selectedEvents.length, 1)
			assert.equal(comparedEvents.length, 1)
		} finally {
			host.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue wires BroadcastNleVaultWorkbench with Shift+F9 shortcut cleanly', async () => {
		window.localStorage.clear()
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const statsModule = loadModule('src/tools/duplicateStats.js')
		const pathDiffModule = loadModule('src/tools/duplicatePathDiff.js')
		const selectionModule = loadModule('src/tools/duplicateSelectionAndExport.js', {
			'./duplicatePathDiff': pathDiffModule,
			'./duplicateStats': statsModule,
		})
		const treemapModule = loadModule('src/tools/duplicateTreemap.js', {
			'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
			'./duplicatePathDiff': pathDiffModule,
			'./duplicateStats': statsModule,
		})

		const slotBox = tag => ({ render(h) { return h(tag, this.$slots.default) } })
		const icon = slotBox('span')
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'isScanning'],
			render(h) { return h('div', { class: `stub-${name}` }) },
		})

		const SearchBar = loadComponent('src/components/SearchBar.vue', {
			'vue-material-design-icons/ChevronDown': icon,
		})
		const NcAppNavigationItemStub = {
			props: ['name', 'title', 'allowCollapse', 'open', 'active'],
			render(h) {
				return h('div', [h('button', { attrs: { type: 'button' } }, this.name), this.$slots.default])
			},
		}
		const DuplicateListItem = loadComponent('src/components/DuplicateListItem.vue', {
			'@nextcloud/vue': { NcAppNavigationItem: NcAppNavigationItemStub },
			'@/tools/duplicateStats': statsModule,
			'@/tools/utils': utils,
		})
		const DuplicateNavigation = loadComponent('src/components/DuplicateNavigation.vue', {
			'@nextcloud/vue': {
				NcAppNavigation: { render(h) { return h('nav', this.$scopedSlots.list ? this.$scopedSlots.list() : this.$slots.default) } },
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
			'@/tools/api': { fetchDuplicates: async () => ({ entities: [], pagination: { currentPage: 1, totalPages: 1 } }) },
			'@/tools/utils': utils,
			'@/tools/duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
			'@/tools/duplicatePreferences': loadModule('src/tools/duplicatePreferences.js'),
			'@/tools/duplicateSelectionAndExport': selectionModule,
			'@/tools/duplicateSortHelper': loadModule('src/tools/duplicateSortHelper.js'),
			'@/tools/duplicateStats': statsModule,
		})
		const DuplicateTreemap = loadComponent('src/components/DuplicateTreemap.vue', {
			'../tools/duplicateStats': statsModule,
			'../tools/duplicateTreemap': treemapModule,
		})
		const BroadcastNleVaultWorkbench = loadBroadcastNleVaultWorkbench()

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
			'./components/BroadcastNleVaultWorkbench.vue': { __esModule: true, default: BroadcastNleVaultWorkbench },
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
					entities: type === 'unacknowledged' ? buildSampleBroadcastNleDuplicates() : [],
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

			const btn = vm.$el.querySelector('button.topbar-broadcast-nle-vault-button')
			assert.ok(btn, 'Broadcast & NLE Vault button is rendered in topbar')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Shift+F9')
			assert.equal(vm.$el.querySelector('.broadcast-nle-vault-workbench'), null)

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F9', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.ok(vm.$el.querySelector('.broadcast-nle-vault-workbench'), 'BroadcastNleVaultWorkbench must open on Shift+F9 shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F9', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.$el.querySelector('.broadcast-nle-vault-workbench'), null, 'BroadcastNleVaultWorkbench must toggle closed on Shift+F9 shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Broadcast Video, NLE Proxy & Camera Card Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/broadcastNleVaultAuditor.js',
			'src/components/BroadcastNleVaultWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `No U+2013/U+2014 in ${rel}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `No XSS sink in ${rel}`)
		}
	})
})
