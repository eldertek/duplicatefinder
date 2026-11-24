const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

/**
 * Load the pure E-Commerce, PIM Product Media & Brand Asset Vault auditor module.
 *
 * @return {object} Loaded module exports.
 */
function loadEcommercePimVaultModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateStats': duplicateStats,
	})
	return loadModule('src/tools/ecommercePimVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

/**
 * Load EcommercePimVaultWorkbench Vue component with mocked clipboard helper.
 *
 * @param {Array<string>} [copiedPayloads] Array collecting copied strings.
 * @return {object} Loaded Vue component definition.
 */
function loadEcommercePimVaultWorkbench(copiedPayloads = []) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateStats': duplicateStats,
	})
	const ecommercePimVaultAuditor = loadModule('src/tools/ecommercePimVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/EcommercePimVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async (text) => {
				copiedPayloads.push(text)
				return true
			},
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/ecommercePimVaultAuditor': ecommercePimVaultAuditor,
	})
}

/**
 * Build deterministic E-Commerce SKU visual masters, approved brand logos,
 * published hero packshots, derived multi-size renders, catalog spec PDFs, and PIM feeds.
 *
 * @param {number} [nowMs] Reference epoch milliseconds.
 * @return {Array<object>} Sample duplicate groups.
 */
function buildSampleEcommercePimDuplicates(nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)) {
	const oneDayAgo = Math.floor((nowMs - 1 * 24 * 60 * 60 * 1000) / 1000)
	const tenDaysAgo = Math.floor((nowMs - 10 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 1911,
			hash: 'hash-sku-4021-master-psd',
			acknowledged: false,
			files: [
				{
					id: 19111,
					path: '/PIM_Vault/Masters/SKU-4021/SKU-4021_hoodie_front.psd',
					size: 180 * 1024 * 1024,
					mtime: tenDaysAgo,
				},
				{
					id: 19112,
					path: '/Ecommerce/Staging/SKU-4021_hoodie_front_copy.psd',
					size: 180 * 1024 * 1024,
					mtime: oneDayAgo,
				},
			],
		},
		{
			id: 1912,
			hash: 'hash-brand-logo-svg',
			acknowledged: false,
			files: [
				{
					id: 19121,
					path: '/Brand_Guidelines/Logos/brand_logo_official.svg',
					size: 2 * 1024 * 1024,
					mtime: tenDaysAgo,
				},
				{
					id: 19122,
					path: '/PIM_Vault/Brand_Assets/brand_logo_official.svg',
					size: 2 * 1024 * 1024,
					mtime: tenDaysAgo,
				},
			],
		},
		{
			id: 1913,
			hash: 'hash-sku-4021-hero-vs-cdn-cache',
			acknowledged: false,
			files: [
				{
					id: 19131,
					path: '/PIM_Vault/Published/Hero/SKU-4021_hoodie_front_hero.png',
					size: 24 * 1024 * 1024,
					mtime: tenDaysAgo,
				},
				{
					id: 19132,
					path: '/Ecommerce/cdn_cache/thumbnails/SKU-4021_hoodie_front@2x.webp',
					size: 24 * 1024 * 1024,
					mtime: oneDayAgo,
				},
				{
					id: 19133,
					path: '/Ecommerce/marketplace_exports/amazon/SKU-4021_hoodie_front_1200w.jpg',
					size: 24 * 1024 * 1024,
					mtime: oneDayAgo,
				},
			],
		},
		{
			id: 1914,
			hash: 'hash-orphan-derived-packshot',
			acknowledged: false,
			files: [
				{
					id: 19141,
					path: '/Ecommerce/Packshots/SKU-8899_sneaker_side_1200w.webp',
					size: 8 * 1024 * 1024,
					mtime: tenDaysAgo,
				},
				{
					id: 19142,
					path: '/Ecommerce/cdn_cache/thumbs/SKU-8899_sneaker_side_thumb.avif',
					size: 8 * 1024 * 1024,
					mtime: oneDayAgo,
				},
			],
		},
		{
			id: 1915,
			hash: 'hash-catalog-spec-sheet-pdf',
			acknowledged: false,
			files: [
				{
					id: 19151,
					path: '/PIM_Vault/Spec_Sheets/SKU-4021_datasheet.pdf',
					size: 12 * 1024 * 1024,
					mtime: tenDaysAgo,
				},
				{
					id: 19152,
					path: '/Ecommerce/exports/tmp/SKU-4021_datasheet.pdf',
					size: 12 * 1024 * 1024,
					mtime: oneDayAgo,
				},
			],
		},
		{
			id: 1916,
			hash: 'hash-pim-feed-csv-export',
			acknowledged: false,
			files: [
				{
					id: 19161,
					path: '/PIM_Vault/Feeds/Akeneo/catalog_products_master.csv',
					size: 40 * 1024 * 1024,
					mtime: tenDaysAgo,
				},
				{
					id: 19162,
					path: '/PIM_Vault/feeds/staging/catalog_products_export_20261120.csv',
					size: 40 * 1024 * 1024,
					mtime: oneDayAgo,
				},
				{
					id: 19163,
					path: '/Ecommerce/exports/old/catalog_products_bak.xlsx',
					size: 40 * 1024 * 1024,
					mtime: oneDayAgo,
				},
			],
		},
		{
			id: 1917,
			hash: 'hash-non-ecommerce-system-log',
			acknowledged: false,
			files: [
				{
					id: 19171,
					path: '/var/log/nginx/access.log',
					size: 5 * 1024 * 1024,
					mtime: oneDayAgo,
				},
				{
					id: 19172,
					path: '/tmp/nginx/access.log',
					size: 5 * 1024 * 1024,
					mtime: oneDayAgo,
				},
			],
		},
	]
}

describe('Cycle 191: E-Commerce, PIM Product Media & Brand Asset Vault Auditor', () => {
	test('classifies SKU masters, derived packshots, catalog PDFs, and PIM feeds while ignoring unrelated files', () => {
		const {
			classifyEcommercePimFile,
			isEcommercePimGroup,
			extractSkuCode,
			extractEcommerceSkuStem,
		} = loadEcommercePimVaultModule()

		assert.equal(extractSkuCode('/PIM_Vault/Masters/SKU-4021_hoodie_front.psd', 'SKU-4021_hoodie_front.psd'), 'SKU-4021')
		assert.equal(extractEcommerceSkuStem('SKU-4021_hoodie_front@2x.webp'), 'sku-4021_hoodie_front')
		assert.equal(extractEcommerceSkuStem('SKU-4021_hoodie_front_1200w.jpg'), 'sku-4021_hoodie_front')
		assert.equal(extractEcommerceSkuStem('SKU-4021_hoodie_front_hero.png'), 'sku-4021_hoodie_front')

		const psdMeta = classifyEcommercePimFile({ path: '/PIM_Vault/Masters/SKU-4021_hoodie_front.psd', size: 1000 })
		assert.equal(psdMeta.family, 'sku-visual-masters')
		assert.equal(psdMeta.isSkuMaster, true)

		const logoMeta = classifyEcommercePimFile({ path: '/Brand_Guidelines/Logos/brand_logo_official.svg', size: 1000 })
		assert.equal(logoMeta.family, 'sku-visual-masters')
		assert.equal(logoMeta.isBrandLogoAsset, true)

		const heroMeta = classifyEcommercePimFile({ path: '/PIM_Vault/Published/Hero/SKU-4021_hoodie_front_hero.png', size: 1000 })
		assert.equal(heroMeta.family, 'derived-packshot-renders')
		assert.equal(heroMeta.isHeroPackshot, true)

		const derivedMeta = classifyEcommercePimFile({ path: '/Ecommerce/cdn_cache/thumbnails/SKU-4021_hoodie_front@2x.webp', size: 1000 })
		assert.equal(derivedMeta.family, 'derived-packshot-renders')
		assert.equal(derivedMeta.isDerivedPackshotVariant, true)
		assert.equal(derivedMeta.variantTag, '@2x')

		const pdfMeta = classifyEcommercePimFile({ path: '/PIM_Vault/Spec_Sheets/SKU-4021_datasheet.pdf', size: 1000 })
		assert.equal(pdfMeta.family, 'catalog-spec-sheets')

		const feedMeta = classifyEcommercePimFile({ path: '/PIM_Vault/feeds/staging/catalog_products_export_20261120.csv', size: 1000 })
		assert.equal(feedMeta.family, 'pim-feeds-exports')
		assert.equal(feedMeta.isStalePimFeed, true)

		const nonDomain = classifyEcommercePimFile({ path: '/var/log/nginx/access.log', size: 1000 })
		assert.equal(nonDomain.family, null)

		const groups = buildSampleEcommercePimDuplicates()
		assert.equal(isEcommercePimGroup(groups[0]), true)
		assert.equal(isEcommercePimGroup(groups[6]), false)
	})

	test('strictly shields SKU masters, approved brand logos, and published hero packshots while reclaiming verified derived variants and stale feeds', () => {
		const { auditEcommercePimVault } = loadEcommercePimVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleEcommercePimDuplicates(nowMs)

		const audit = auditEcommercePimVault(groups, {}, nowMs)
		assert.equal(audit.summary.totalClustersCount, 6)

		// 1. SKU master PSD copies strictly shielded when protectSkuMasters=true
		const psdCluster = audit.clusters.find(c => c.id === 1911)
		assert.ok(psdCluster)
		assert.equal(psdCluster.clusterVerdict, 'sku-master-protected')
		assert.equal(psdCluster.reclaimableBytes, 0)
		assert.equal(psdCluster.members.every(m => m.shielded && m.action === 'keep'), true)

		// 2. Approved brand logo SVG strictly shielded
		const logoCluster = audit.clusters.find(c => c.id === 1912)
		assert.ok(logoCluster)
		assert.equal(logoCluster.clusterVerdict, 'brand-logo-protected')
		assert.equal(logoCluster.reclaimableBytes, 0)

		// 3. Published hero packshot conserved while @2x.webp and 1200w.jpg derivatives are reclaimed
		const heroCluster = audit.clusters.find(c => c.id === 1913)
		assert.ok(heroCluster)
		assert.equal(heroCluster.hasHeroPackshot, true)
		assert.equal(heroCluster.hasVerifiedMasterAnchor, true)
		assert.equal(heroCluster.reclaimableTargetsCount, 2)
		assert.equal(heroCluster.reclaimableBytes, 48 * 1024 * 1024)
		const heroMember = heroCluster.members.find(m => m.id === 19131)
		assert.equal(heroMember.shielded, true)
		assert.equal(heroMember.action, 'keep')

		// 4. Orphan derived packshots without conserved PSD/AI/SVG/Hero anchor are blocked by requireVerifiedMasterForDerivativePrune=true
		const orphanCluster = audit.clusters.find(c => c.id === 1914)
		assert.ok(orphanCluster)
		assert.equal(orphanCluster.hasVerifiedMasterAnchor, false)
		assert.equal(orphanCluster.reclaimableBytes, 0)

		// Unlocking requireVerifiedMasterForDerivativePrune allows pruning the secondary orphan derivative while keeping survivor
		const unlockedAudit = auditEcommercePimVault(groups, { requireVerifiedMasterForDerivativePrune: false }, nowMs)
		const unlockedOrphan = unlockedAudit.clusters.find(c => c.id === 1914)
		assert.equal(unlockedOrphan.reclaimableTargetsCount, 1)
		assert.equal(unlockedOrphan.reclaimableBytes, 8 * 1024 * 1024)

		// 5. Catalog PDF spec-sheet keeps canonical and reclaims tmp copy
		const pdfCluster = audit.clusters.find(c => c.id === 1915)
		assert.ok(pdfCluster)
		assert.equal(pdfCluster.reclaimableTargetsCount, 1)

		// 6. PIM feeds keep canonical master CSV and reclaim staging/old exports
		const feedCluster = audit.clusters.find(c => c.id === 1916)
		assert.ok(feedCluster)
		assert.equal(feedCluster.reclaimableTargetsCount, 2)
		assert.equal(feedCluster.reclaimableBytes, 80 * 1024 * 1024)
	})

	test('enforces recent feed grace window, hardlink safety on mutable files, presets, filters, and member overrides', () => {
		const { auditEcommercePimVault, buildEcommercePimRemediationScript } = loadEcommercePimVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleEcommercePimDuplicates(nowMs)

		// Grace window of 5 days shields 1-day-old staging feeds and derived packshots
		const graceAudit = auditEcommercePimVault(groups, { keepRecentFeedDays: 5 }, nowMs)
		const graceFeed = graceAudit.clusters.find(c => c.id === 1916)
		assert.equal(graceFeed.reclaimableBytes, 0)

		// Hardlink strategy hardlinks immutable packshots/PDFs but blocks mutable PSD/AI/CSV/XLSX
		const hardlinkAudit = auditEcommercePimVault(groups, {
			presetId: 'hardlink-published-packshots',
			strategy: 'hardlink-published-packshots-vault',
		}, nowMs)
		const hardlinkPdf = hardlinkAudit.clusters.find(c => c.id === 1915)
		assert.equal(hardlinkPdf.hardlinkTargetsCount, 1)
		const hardlinkScript = buildEcommercePimRemediationScript(hardlinkAudit)
		const hardlinkCmdLines = hardlinkScript.split('\n').filter(line => line.startsWith('run_cmd '))
		assert.match(hardlinkScript, /ln -f /)
		assert.equal(hardlinkCmdLines.some(line => line.includes('SKU-4021_hoodie_front.psd')), false)
		assert.equal(hardlinkCmdLines.some(line => line.includes('ln -f') && /\.(?:psd|csv|xlsx)['"]?$/.test(line)), false)

		// Per-copy override forces keep on a reclaimable variant
		const targetKey = 19132
		const overrideAudit = auditEcommercePimVault(groups, {
			memberOverrides: { [targetKey]: 'keep' },
		}, nowMs)
		const overriddenHero = overrideAudit.clusters.find(c => c.id === 1913)
		assert.equal(overriddenHero.reclaimableTargetsCount, 1)

		// Search filter matches SKU code and variant tag
		const searchAudit = auditEcommercePimVault(groups, { searchQuery: '@2x' }, nowMs)
		assert.equal(searchAudit.clusters.length, 1)
		assert.equal(searchAudit.clusters[0].id, 1913)
	})

	test('emits DRY_RUN=1 POSIX script, CWE-1236-safe CSV, JSON manifest, and .sync-exclude.lst rules', () => {
		const {
			ECOMMERCE_PIM_VAULT_SCHEMA,
			auditEcommercePimVault,
			buildEcommercePimRemediationScript,
			buildEcommercePimCsvReport,
			buildEcommercePimJsonManifest,
			buildEcommercePimSyncExcludeList,
		} = loadEcommercePimVaultModule()

		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleEcommercePimDuplicates(nowMs)
		groups.push({
			id: 1918,
			hash: 'hash-cwe-1236-injection',
			acknowledged: false,
			files: [
				{
					id: 19181,
					path: '/PIM_Vault/Feeds/=CMD("calc")_feed.csv',
					size: 1024 * 1024,
					mtime: Math.floor((nowMs - 10 * 86400000) / 1000),
				},
				{
					id: 19182,
					path: '/PIM_Vault/feeds/staging/+SUM(A1)_export.csv',
					size: 1024 * 1024,
					mtime: Math.floor((nowMs - 86400000) / 1000),
				},
			],
		})

		const audit = auditEcommercePimVault(groups, {}, nowMs)
		const script = buildEcommercePimRemediationScript(audit)
		const scriptCmdLines = script.split('\n').filter(line => line.startsWith('run_cmd '))
		assert.match(script, /^#!\/usr\/bin\/env bash/m)
		assert.match(script, /set -euo pipefail/)
		assert.match(script, /DRY_RUN="\$\{DRY_RUN:-1\}"/)
		assert.match(script, /SKU-4021_hoodie_front@2x\.webp/)
		assert.equal(scriptCmdLines.some(line => line.includes('brand_logo_official.svg')), false)
		assert.equal(scriptCmdLines.some(line => line.includes('SKU-4021_hoodie_front_hero.png')), false)
		assert.equal(scriptCmdLines.some(line => line.includes('catalog_products_master.csv')), false)

		const csv = buildEcommercePimCsvReport(audit)
		assert.match(csv, /cluster_id,cluster_name,sku_code,sku_stem/)
		assert.match(csv, /'=CMD|"'=CMD|"\+SUM|'\+SUM/)
		assert.equal(/[\r\n](?:=|\+|-|@)/.test(csv), false, 'CSV cells must never start with raw formula prefix')

		const manifest = JSON.parse(buildEcommercePimJsonManifest(audit))
		assert.equal(manifest.schema, ECOMMERCE_PIM_VAULT_SCHEMA)
		assert.ok(Array.isArray(manifest.clusters))
		assert.equal(manifest.clusters.length, 7)

		const syncExclude = buildEcommercePimSyncExcludeList()
		assert.match(syncExclude, /cdn_cache\//)
		assert.match(syncExclude, /\*@2x\.webp/)
		assert.match(syncExclude, /feeds\/staging\//)
	})

	test('EcommercePimVaultWorkbench Vue component renders KPIs, controls, overrides, and exports cleanly', async () => {
		const copiedPayloads = []
		const Workbench = loadEcommercePimVaultWorkbench(copiedPayloads)
		const groups = buildSampleEcommercePimDuplicates()

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: groups,
					allDuplicates: groups,
					currentDuplicateId: 1913,
				},
			}),
		}).$mount(mountNode)

		try {
			await settle()
			const rootEl = vm.$el
			assert.ok(rootEl.classList.contains('ecommerce-pim-vault-workbench'))
			assert.match(rootEl.textContent, /E-Commerce, PIM Product Media & Brand Asset Vault Auditor/)
			assert.match(rootEl.textContent, /SKU-4021/)

			// Copy DRY_RUN=1 script button works
			const copyScriptBtn = Array.from(rootEl.querySelectorAll('button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			assert.ok(copyScriptBtn)
			copyScriptBtn.click()
			await settle()
			assert.equal(copiedPayloads.length, 1)
			assert.match(copiedPayloads[0], /DRY_RUN/)

			// Copy .sync-exclude.lst button works
			const copyExcludeBtn = Array.from(rootEl.querySelectorAll('button')).find(b => b.textContent.includes('Copy .sync-exclude.lst'))
			assert.ok(copyExcludeBtn)
			copyExcludeBtn.click()
			await settle()
			assert.equal(copiedPayloads.length, 2)
			assert.match(copiedPayloads[1], /cdn_cache\//)

			// Preset switching updates filter
			const feedPresetBtn = Array.from(rootEl.querySelectorAll('.epv__seg-btn')).find(b => b.textContent.includes('PIM Feeds & Channel Exports'))
			assert.ok(feedPresetBtn)
			feedPresetBtn.click()
			await settle()
			assert.equal(rootEl.querySelectorAll('.epv__cluster-card').length, 1)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}

		// Empty state renders scan prompt
		const emptyNode = document.createElement('div')
		document.body.appendChild(emptyNode)
		const emptyVm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: [],
					allDuplicates: [],
				},
			}),
		}).$mount(emptyNode)
		try {
			await settle()
			assert.ok(emptyVm.$el.querySelector('.epv__empty-banner'))
		} finally {
			emptyVm.$destroy()
			emptyNode.remove()
		}
	})

	test('App.vue wires EcommercePimVaultWorkbench with Shift+F7 shortcut cleanly', async () => {
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
				return h('div', { class: 'nc-nav-item' }, [this.$slots.default])
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

		const EcommercePimVaultWorkbench = loadEcommercePimVaultWorkbench()

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
			'./components/EcommercePimVaultWorkbench.vue': { __esModule: true, default: EcommercePimVaultWorkbench },
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
					entities: type === 'unacknowledged' ? buildSampleEcommercePimDuplicates() : [],
					pagination: { currentPage: 1, totalPages: 1, totalItems: 7, hasMore: false },
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

			const btn = vm.$el.querySelector('button.topbar-ecommerce-pim-vault-button')
			assert.ok(btn, 'E-Commerce & PIM Vault button is rendered in topbar')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Shift+F7')
			assert.equal(vm.$el.querySelector('.ecommerce-pim-vault-workbench'), null)

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F7', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.ok(vm.$el.querySelector('.ecommerce-pim-vault-workbench'), 'EcommercePimVaultWorkbench must open on Shift+F7 shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F7', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.$el.querySelector('.ecommerce-pim-vault-workbench'), null, 'EcommercePimVaultWorkbench must toggle closed on Shift+F7 shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new E-Commerce, PIM Product Media & Brand Asset Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/ecommercePimVaultAuditor.js',
			'src/components/EcommercePimVaultWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `No U+2013/U+2014 in ${rel}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `No XSS sink in ${rel}`)
		}
	})
})
