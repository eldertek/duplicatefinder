const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

/**
 * Load the pure Publishing, Prepress, Print-Ready PDF/X & Font Licensing Vault auditor module.
 *
 * @return {object} Loaded module exports.
 */
function loadPublishingPrepressVaultModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateStats': duplicateStats,
	})
	return loadModule('src/tools/publishingPrepressVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

/**
 * Load PublishingPrepressVaultWorkbench Vue component with mocked clipboard helper.
 *
 * @param {Array<string>} [copiedPayloads] Array collecting copied strings.
 * @return {object} Loaded Vue component definition.
 */
function loadPublishingPrepressVaultWorkbench(copiedPayloads = []) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateStats': duplicateStats,
	})
	const publishingPrepressVaultAuditor = loadModule('src/tools/publishingPrepressVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/PublishingPrepressVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async (text) => {
				copiedPayloads.push(text)
				return true
			},
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/publishingPrepressVaultAuditor': publishingPrepressVaultAuditor,
	})
}

/**
 * Build deterministic Publishing, Prepress, PDF/X & Font Licensing duplicate groups.
 *
 * @param {number} [nowMs] Reference epoch milliseconds.
 * @return {Array<object>} Sample duplicate groups.
 */
function buildSamplePublishingPrepressDuplicates(nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)) {
	const twoDaysAgo = Math.floor((nowMs - 2 * 24 * 60 * 60 * 1000) / 1000)
	const thirtyDaysAgo = Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 1961,
			hash: 'hash-indd-layout-master',
			acknowledged: false,
			files: [
				{
					id: 19611,
					path: '/Publishing_Vault/01_Masters/Autumn_Catalog_2026/Autumn_Catalog_2026.indd',
					size: 84 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19612,
					path: '/Archive_Final/Autumn_Catalog_2026/Autumn_Catalog_2026.indd',
					size: 84 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1962,
			hash: 'hash-afpub-and-qxp-masters',
			acknowledged: false,
			files: [
				{
					id: 19621,
					path: '/Publishing_Vault/01_Masters/Monograph_Press/Monograph_Press.afpub',
					size: 62 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19622,
					path: '/Publishing_Vault/01_Masters/Monograph_Press/Copy/Monograph_Press.afpub',
					size: 62 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1963,
			hash: 'hash-idml-interchange',
			acknowledged: false,
			files: [
				{
					id: 19631,
					path: '/Publishing_Vault/01_Masters/Annual_Report/Annual_Report.idml',
					size: 16 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19632,
					path: '/tmp/Annual_Report.idml',
					size: 16 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1964,
			hash: 'hash-signed-pdfx4-bat',
			acknowledged: false,
			files: [
				{
					id: 19641,
					path: '/Prepress_Vault/BAT_Signed/Autumn_Catalog_2026_PDFX4_BAT_Signed.pdf',
					size: 120 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19642,
					path: '/Prepress_Vault/Print_Mirror/Autumn_Catalog_2026_PDFX4_BAT_Signed.pdf',
					size: 120 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1965,
			hash: 'hash-superseded-web-proof-with-anchor',
			acknowledged: false,
			files: [
				{
					id: 19651,
					path: '/Publishing_Vault/Exports/Autumn_Catalog_2026_print.pdf',
					size: 95 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19652,
					path: '/Downloads/Autumn_Catalog_2026_web.pdf',
					size: 95 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1966,
			hash: 'hash-unverified-bleed-proof',
			acknowledged: false,
			files: [
				{
					id: 19661,
					path: '/Prepress_Vault/Proofs/Orphan_Poster_bleed.pdf',
					size: 40 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19662,
					path: '/Downloads/Orphan_Poster_proof.pdf',
					size: 40 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1967,
			hash: 'hash-font-otf-license-duplicate',
			acknowledged: false,
			files: [
				{
					id: 19671,
					path: '/Licensed_Fonts/Foundry_Vault/HelveticaNeue-Bold.otf',
					size: 480 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19672,
					path: '/Campaigns/Autumn_Catalog_2026/Document fonts/HelveticaNeue-Bold.otf',
					size: 480 * 1024,
					mtime: twoDaysAgo,
				},
				{
					id: 19673,
					path: '/Downloads/HelveticaNeue-Bold.otf',
					size: 480 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1968,
			hash: 'hash-font-woff2-cross-format-family',
			acknowledged: false,
			files: [
				{
					id: 19681,
					path: '/Campaigns/Microsite/Document fonts/HelveticaNeue-Regular.woff2',
					size: 220 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19682,
					path: '/tmp/fonts/HelveticaNeue-Regular.woff2',
					size: 220 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1969,
			hash: 'hash-cmyk-hires-links',
			acknowledged: false,
			files: [
				{
					id: 19691,
					path: '/Prepress_Assets/HighRes_CMYK/Hero_Cover_300dpi_Fogra39.tif',
					size: 210 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19692,
					path: '/Campaigns/Autumn_Catalog_2026/Links/Hero_Cover_300dpi_Fogra39.tif',
					size: 210 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
				{
					id: 19693,
					path: '/Campaigns/Autumn_Catalog_2026/Links/Hero_Cover_Vector.eps',
					size: 210 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1970,
			hash: 'hash-cmyk-psd-link',
			acknowledged: false,
			files: [
				{
					id: 19701,
					path: '/Prepress_Assets/HighRes_CMYK/Packaging_Box_CMYK.psd',
					size: 160 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19702,
					path: '/Campaigns/Packaging/Links/Packaging_Box_CMYK.psd',
					size: 160 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1971,
			hash: 'hash-unrelated-vacation-tif',
			acknowledged: false,
			files: [
				{
					id: 19711,
					path: '/Photos/vacation/sunset_beach.tif',
					size: 24 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19712,
					path: '/Photos/holidays/sunset_beach.tif',
					size: 24 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
	]
}

describe('Cycle 196: Publishing, Prepress, Print-Ready PDF/X & Font Licensing Vault Auditor', () => {
	test('classifies .indd/.idml/.afpub/.qxp layouts, PDF/X-4 BAT & prepress proofs, commercial fonts, and CMYK links while excluding unrelated photos', () => {
		const {
			classifyPublishingPrepressFile,
			isPublishingPrepressGroup,
			extractFontFamilyInfo,
			extractPublishingLineageStem,
		} = loadPublishingPrepressVaultModule()

		const indd = classifyPublishingPrepressFile({ path: '/Publishing_Vault/01_Masters/Catalog/Autumn_Catalog_2026.indd', size: 1024 })
		assert.equal(indd.family, 'layout-sources')
		assert.equal(indd.isLayoutSource, true)
		assert.equal(indd.publishingTool, 'InDesign')

		const afpub = classifyPublishingPrepressFile({ path: '/Publishing_Vault/01_Masters/Book/Monograph.afpub', size: 1024 })
		assert.equal(afpub.family, 'layout-sources')
		assert.equal(afpub.isLayoutSource, true)
		assert.equal(afpub.publishingTool, 'Affinity Publisher')

		const qxp = classifyPublishingPrepressFile({ path: '/Publishing_Vault/01_Masters/Magazine/Issue12.qxp', size: 1024 })
		assert.equal(qxp.family, 'layout-sources')
		assert.equal(qxp.isLayoutSource, true)
		assert.equal(qxp.publishingTool, 'QuarkXPress')

		const bat = classifyPublishingPrepressFile({ path: '/Prepress_Vault/BAT_Signed/Autumn_Catalog_2026_PDFX4_BAT_Signed.pdf', size: 1024 })
		assert.equal(bat.family, 'prepress-pdfx-proofs')
		assert.equal(bat.isSignedPdfx4Bat, true)
		assert.equal(bat.lineageStem, indd.lineageStem)

		const bleedPdf = classifyPublishingPrepressFile({ path: '/Exports/Autumn_Catalog_2026_bleed.pdf', size: 1024 })
		assert.equal(bleedPdf.family, 'prepress-pdfx-proofs')
		assert.equal(bleedPdf.isBleedPdf, true)
		assert.equal(bleedPdf.isSignedPdfx4Bat, false)

		const fontInfo = extractFontFamilyInfo('HelveticaNeue-BoldItalic.otf', '/Licensed_Fonts/HelveticaNeue-BoldItalic.otf')
		assert.equal(fontInfo.fontFamily, 'HelveticaNeue')
		assert.equal(fontInfo.fontFormat, 'OTF')
		assert.match(fontInfo.fontWeightStyle, /Bold/i)

		const fontMaster = classifyPublishingPrepressFile({ path: '/Licensed_Fonts/HelveticaNeue-Bold.otf', size: 1024 })
		assert.equal(fontMaster.family, 'licensed-commercial-fonts')
		assert.equal(fontMaster.isLicensedFontMaster, true)

		const fontClone = classifyPublishingPrepressFile({ path: '/Campaigns/Spring/Document fonts/HelveticaNeue-Bold.ttf', size: 1024 })
		assert.equal(fontClone.family, 'licensed-commercial-fonts')
		assert.equal(fontClone.isLicensedFontMaster, false)
		assert.equal(fontClone.hasFontLicenseRisk, true)

		const cmykTif = classifyPublishingPrepressFile({ path: '/Prepress_Assets/HighRes_CMYK/Hero_Cover_300dpi_Fogra39.tif', size: 1024 })
		assert.equal(cmykTif.family, 'cmyk-hires-links')
		assert.equal(cmykTif.isCmykMasterLink, true)

		const epsLink = classifyPublishingPrepressFile({ path: '/Campaigns/Autumn/Links/Logo_Spot.eps', size: 1024 })
		assert.equal(epsLink.family, 'cmyk-hires-links')
		assert.equal(epsLink.isCmykPackageClone, true)

		const unrelatedPhoto = classifyPublishingPrepressFile({ path: '/Photos/vacation/sunset_beach.tif', size: 1024 })
		assert.equal(unrelatedPhoto.family, null)

		assert.equal(extractPublishingLineageStem('Autumn_Catalog_2026_web.pdf'), 'autumn_catalog_2026')
		assert.equal(isPublishingPrepressGroup({ files: [{ path: '/Photos/vacation/sunset_beach.tif', size: 100 }] }), false)
		assert.equal(isPublishingPrepressGroup({ files: [{ path: '/Masters/Brochure.qxp', size: 100 }] }), true)
	})

	test('strictly conserves .indd/.afpub/.qxp sources, signed PDF/X-4 BAT proofs, and master licensed fonts while detecting font family duplicates and verifying layout anchors', () => {
		const { auditPublishingPrepressVault } = loadPublishingPrepressVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSamplePublishingPrepressDuplicates(nowMs)

		const audit = auditPublishingPrepressVault(groups, {}, nowMs)

		// Group 1971 (/Photos/vacation/sunset_beach.tif) must be excluded -> 10 domain clusters
		assert.equal(audit.summary.totalClustersCount, 10)
		assert.equal(audit.familyCounts['layout-sources'], 3)
		assert.equal(audit.familyCounts['prepress-pdfx-proofs'], 3)
		assert.equal(audit.familyCounts['licensed-commercial-fonts'], 2)
		assert.equal(audit.familyCounts['cmyk-hires-links'], 2)

		// .indd and .afpub layout sources strictly conserved
		const inddCluster = audit.clusters.find(c => c.id === 1961)
		assert.equal(inddCluster.clusterVerdict, 'layout-source-protected')
		assert.equal(inddCluster.reclaimableBytes, 0)
		assert.equal(inddCluster.members.every(m => m.shielded && m.action === 'keep'), true)

		const afpubCluster = audit.clusters.find(c => c.id === 1962)
		assert.equal(afpubCluster.clusterVerdict, 'layout-source-protected')
		assert.equal(afpubCluster.reclaimableBytes, 0)

		// Signed PDF/X-4 BAT strictly conserved
		const batCluster = audit.clusters.find(c => c.id === 1964)
		assert.equal(batCluster.clusterVerdict, 'signed-pdfx4-bat-protected')
		assert.equal(batCluster.reclaimableBytes, 0)

		// Superseded proof WITH verified Autumn_Catalog_2026.indd anchor -> _web.pdf reclaimable
		const anchoredProof = audit.clusters.find(c => c.id === 1965)
		assert.equal(anchoredProof.hasLayoutSourceAnchor, true)
		assert.equal(anchoredProof.reclaimableTargetsCount, 1)
		const webCopy = anchoredProof.members.find(m => m.normalized.endsWith('_web.pdf'))
		assert.equal(webCopy.action, 'delete')
		assert.equal(webCopy.shielded, false)

		// Orphan proof WITHOUT verified layout anchor -> shielded
		const orphanProof = audit.clusters.find(c => c.id === 1966)
		assert.equal(orphanProof.hasLayoutSourceAnchor, false)
		assert.equal(orphanProof.reclaimableBytes, 0)
		assert.equal(orphanProof.members.every(m => m.shielded), true)

		// Font licensing & cross-cluster HelveticaNeue family duplicate detection
		const otfFontCluster = audit.clusters.find(c => c.id === 1967)
		assert.equal(otfFontCluster.hasFontLicenseDuplicateRisk, true)
		assert.equal(otfFontCluster.maxFontRiskLevel, 'critical')
		assert.equal(otfFontCluster.fontFamilyClusterCount, 2)
		assert.ok(otfFontCluster.fontFamilyFormats.includes('OTF'))
		assert.ok(otfFontCluster.fontFamilyFormats.includes('WOFF2'))
		const masterFontMember = otfFontCluster.members.find(m => m.isLicensedFontMaster)
		assert.equal(masterFontMember.shielded, true)
		assert.equal(masterFontMember.action, 'keep')
		assert.equal(otfFontCluster.reclaimableTargetsCount, 2)
	})

	test('hardlink strategy consolidates immutable .tif/.eps CMYK links and .otf fonts while blocking hardlinks on mutable .psd/.indd/.afpub/.qxp/.idml files', () => {
		const {
			auditPublishingPrepressVault,
			buildPublishingPrepressRemediationScript,
		} = loadPublishingPrepressVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSamplePublishingPrepressDuplicates(nowMs)

		const hardlinkAudit = auditPublishingPrepressVault(groups, {
			strategy: 'hardlink-fonts-and-cmyk-links',
		}, nowMs)

		const cmykTifEpsCluster = hardlinkAudit.clusters.find(c => c.id === 1969)
		assert.equal(cmykTifEpsCluster.hardlinkTargetsCount, 2)
		assert.equal(cmykTifEpsCluster.deleteTargetsCount, 0)

		const cmykPsdCluster = hardlinkAudit.clusters.find(c => c.id === 1970)
		assert.equal(cmykPsdCluster.hardlinkTargetsCount, 0, 'Mutable .psd files must never be hardlinked')
		assert.equal(cmykPsdCluster.deleteTargetsCount, 1)

		const script = buildPublishingPrepressRemediationScript(hardlinkAudit)
		assert.match(script, /DRY_RUN="\$\{DRY_RUN:-1\}"/)
		assert.match(script, /run_cmd ln -f/)
		assert.doesNotMatch(script, /Autumn_Catalog_2026\.indd/)
		assert.doesNotMatch(script, /Autumn_Catalog_2026_PDFX4_BAT_Signed\.pdf/)
		assert.doesNotMatch(script, /ln -f.*Packaging_Box_CMYK\.psd/)
	})

	test('generates CWE-1236-safe CSV, JSON manifest, and .sync-exclude.lst rules', () => {
		const {
			auditPublishingPrepressVault,
			buildPublishingPrepressCsvReport,
			buildPublishingPrepressJsonManifest,
			buildPublishingPrepressSyncExcludeList,
			PUBLISHING_PREPRESS_VAULT_SCHEMA,
		} = loadPublishingPrepressVaultModule()

		const injectionGroup = {
			id: '=CMD("calc")',
			hash: 'hash-cwe1236',
			files: [
				{ id: 1, path: '/Publishing_Vault/01_Masters/=Injected.indd', size: 4096 },
				{ id: 2, path: '/Downloads/+Injected_web.pdf', size: 4096 },
			],
		}
		const audit = auditPublishingPrepressVault([injectionGroup])
		const csv = buildPublishingPrepressCsvReport(audit)
		assert.ok(csv.includes("'=CMD"))
		assert.ok(csv.includes('font_license_duplicate_risk'))

		const manifest = JSON.parse(buildPublishingPrepressJsonManifest(audit))
		assert.equal(manifest.schema, PUBLISHING_PREPRESS_VAULT_SCHEMA)
		assert.equal(manifest.clusters.length, 1)

		const syncExclude = buildPublishingPrepressSyncExcludeList()
		assert.ok(syncExclude.includes('*.idlk'))
		assert.ok(syncExclude.includes('InDesign Recovery/'))
		assert.ok(syncExclude.includes('*.afpub~lock~'))
		assert.ok(syncExclude.includes('*.qxp.lck'))
	})

	test('PublishingPrepressVaultWorkbench renders KPIs, font duplicate badges, copy actions, and emits triage/compare events', async () => {
		const copied = []
		const events = []
		const Workbench = loadPublishingPrepressVaultWorkbench(copied)
		const groups = buildSamplePublishingPrepressDuplicates()

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue({
			render(h) {
				return h(Workbench, {
					props: {
						duplicates: groups,
						allDuplicates: groups,
					},
					on: {
						'select-duplicate': d => events.push(['select', d.id]),
						'compare-duplicate': d => events.push(['compare', d.id]),
					},
				})
			},
		}).$mount(mountNode)

		try {
			await settle()
			const cards = vm.$el.querySelectorAll('.ppv__cluster-card')
			assert.equal(cards.length, 10)

			const fontRiskBadges = vm.$el.querySelectorAll('.ppv__badge.is-security')
			assert.ok(fontRiskBadges.length >= 2, 'Font license duplicate risk badges must render')

			const copyBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			assert.ok(copyBtn)
			copyBtn.click()
			await settle()
			assert.equal(copied.length, 1)
			assert.match(copied[0], /DRY_RUN/)

			const syncBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Copy .sync-exclude.lst'))
			syncBtn.click()
			await settle()
			assert.equal(copied.length, 2)
			assert.ok(copied[1].includes('*.idlk'))

			const triageBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Open in Triage'))
			triageBtn.click()
			const compareBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Side-by-Side'))
			compareBtn.click()
			await settle()
			assert.equal(events.length, 2)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue renders Publishing & Prepress Vault button and toggles PublishingPrepressVaultWorkbench via Shift+F10 shortcut', async () => {
		window.localStorage.clear()
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const icon = { render: h => h('span') }
		const slotBox = tag => ({
			render(h) {
				return h(tag, {}, this.$slots.default)
			},
		})
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'isScanning'],
			render(h) {
				return h('div', { attrs: { 'data-stub': name } })
			},
		})

		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
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

		const PublishingPrepressVaultWorkbench = loadPublishingPrepressVaultWorkbench()

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
			'./components/IotFirmwareVaultWorkbench.vue': { __esModule: true, default: stub('iot-firmware-vault-auditor') },
			'./components/MobileBuildVaultWorkbench.vue': { __esModule: true, default: stub('mobile-build-vault-auditor') },
			'./components/K8sTerraformVaultWorkbench.vue': { __esModule: true, default: stub('k8s-terraform-vault-auditor') },
			'./components/PublishingPrepressVaultWorkbench.vue': { __esModule: true, default: PublishingPrepressVaultWorkbench },
			'./components/GenomicsBioinformaticsVaultWorkbench.vue': { __esModule: true, default: stub('genomics-bioinformatics-vault-auditor') },
			'./components/DfirSecurityVaultWorkbench.vue': { __esModule: true, default: stub('dfir-security-vault-auditor') },
			'./components/RoboticsRosVaultWorkbench.vue': { __esModule: true, default: stub('robotics-ros-vault-auditor') },
			'./components/SemiconductorEdaVaultWorkbench.vue': { __esModule: true, default: stub('semiconductor-eda-vault-auditor') },
			'./components/AerospaceCfdVaultWorkbench.vue': { __esModule: true, default: stub('aerospace-cfd-vault-auditor') },
			'./components/BatteryBmsVaultWorkbench.vue': { __esModule: true, default: stub('battery-bms-vault-auditor') },
			'./components/ChemPharmaGmpVaultWorkbench.vue': { __esModule: true, default: stub('chem-pharma-gmp-vault-auditor') },
			'./components/DigitalGridScadaVaultWorkbench.vue': { __esModule: true, default: stub('digital-grid-scada-vault-auditor') },
			'./components/EnergySeismicVaultWorkbench.vue': { __esModule: true, default: stub('energy-seismic-vault-auditor') },
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
					entities: type === 'unacknowledged' ? buildSamplePublishingPrepressDuplicates() : [],
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

			const btn = vm.$el.querySelector('button.topbar-publishing-prepress-vault-button')
			assert.ok(btn, 'Publishing & Prepress Vault button is rendered in topbar')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Shift+F10')
			assert.equal(vm.$el.querySelector('.publishing-prepress-vault-workbench'), null)

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.ok(vm.$el.querySelector('.publishing-prepress-vault-workbench'), 'PublishingPrepressVaultWorkbench must open on Shift+F10 shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.$el.querySelector('.publishing-prepress-vault-workbench'), null, 'PublishingPrepressVaultWorkbench must toggle closed on Shift+F10 shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Publishing, Prepress, PDF/X & Font Licensing Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/publishingPrepressVaultAuditor.js',
			'src/components/PublishingPrepressVaultWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `No U+2013/U+2014 in ${rel}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `No XSS sink in ${rel}`)
		}
	})
})
