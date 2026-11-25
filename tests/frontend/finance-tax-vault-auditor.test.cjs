const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

/**
 * Load the pure Financial, Accounting & Tax Compliance Vault auditor module.
 *
 * @return {object} Loaded module exports.
 */
function loadFinanceTaxVaultModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateStats': duplicateStats,
	})
	return loadModule('src/tools/financeTaxVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

/**
 * Load FinanceTaxVaultWorkbench Vue component with mocked clipboard helper.
 *
 * @param {Array<string>} [copiedPayloads] Array collecting copied strings.
 * @return {object} Loaded Vue component definition.
 */
function loadFinanceTaxVaultWorkbench(copiedPayloads = []) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateStats': duplicateStats,
	})
	const financeTaxVaultAuditor = loadModule('src/tools/financeTaxVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/FinanceTaxVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async (text) => {
				copiedPayloads.push(text)
				return true
			},
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/financeTaxVaultAuditor': financeTaxVaultAuditor,
	})
}

/**
 * Build deterministic Financial, Accounting & Tax Compliance duplicate groups
 * covering FEC exports (.txt/.tsv), bank statements (.ofx/.qif/.mt940/.camt.xml/.csv),
 * invoices/credit notes/liasses (.pdf), and closing workbooks (.xlsx/.xlsm/.ods).
 *
 * @param {number} [nowMs] Reference epoch milliseconds.
 * @return {Array<object>} Sample duplicate groups.
 */
function buildSampleFinanceTaxDuplicates(nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)) {
	const twoDaysAgo = Math.floor((nowMs - 2 * 24 * 60 * 60 * 1000) / 1000)
	const thirtyDaysAgo = Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 1921,
			hash: 'hash-fec-siren-2024',
			acknowledged: false,
			files: [
				{
					id: 19211,
					path: '/Archives_Fiscales_10ans/FEC/123456789FEC20241231.txt',
					size: 18 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19212,
					path: '/Compta/Staging/123456789FEC20241231_reexport.txt',
					size: 18 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1922,
			hash: 'hash-fec-tsv-vault',
			acknowledged: false,
			files: [
				{
					id: 19221,
					path: '/DGFiP/FEC/987654321FEC20231231.tsv',
					size: 12 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19222,
					path: '/Coffrefort/FEC/987654321FEC20231231.tsv',
					size: 12 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
			],
		},
		{
			id: 1923,
			hash: 'hash-invoice-facturx-vs-scan',
			acknowledged: false,
			files: [
				{
					id: 19231,
					path: '/Archives_Fiscales_10ans/Factures/2024/facture_F2024-0812_facturx_signe.pdf',
					size: 640 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19232,
					path: '/Compta/Scans/facture_F2024-0812_scan.pdf',
					size: 640 * 1024,
					mtime: twoDaysAgo,
				},
				{
					id: 19233,
					path: '/Downloads/facture_F2024-0812_reexport.pdf',
					size: 640 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1924,
			hash: 'hash-orphan-scanned-avoir',
			acknowledged: false,
			files: [
				{
					id: 19241,
					path: '/Compta/Avoirs/avoir_AV2024-019.pdf',
					size: 320 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19242,
					path: '/Inbox_Scan/avoir_AV2024-019_ocr.pdf',
					size: 320 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1925,
			hash: 'hash-bank-camt-mt940-reexport',
			acknowledged: false,
			files: [
				{
					id: 19251,
					path: '/Archives_Fiscales_10ans/Releves_Bancaires/releve_bnp_2024_09_signe.camt.xml',
					size: 4 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19252,
					path: '/Tresorerie/Reexports/releve_bnp_2024_09_reexport.camt.xml',
					size: 4 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1926,
			hash: 'hash-bank-ofx-mt940-csv',
			acknowledged: false,
			files: [
				{
					id: 19261,
					path: '/Tresorerie/EBICS/qonto_2024_10.mt940',
					size: 2 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19262,
					path: '/Downloads/qonto_2024_10_copy.mt940',
					size: 2 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1927,
			hash: 'hash-closed-bilan-xlsx-xlsm',
			acknowledged: false,
			files: [
				{
					id: 19271,
					path: '/Archives_Fiscales_10ans/Bilans/bilan_cloture_FY2024_definitif.xlsx',
					size: 8 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19272,
					path: '/Compta/Brouillons/bilan_cloture_FY2024_brouillon.xlsx',
					size: 8 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1928,
			hash: 'hash-liasse-2050-pdf-closed',
			acknowledged: false,
			files: [
				{
					id: 19281,
					path: '/Coffrefort/Liasses/liasse_2050_FY2024_cloture.pdf',
					size: 5 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19282,
					path: '/Compta/Liasses/liasse_2050_FY2024_cloture.pdf',
					size: 5 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
			],
		},
		{
			id: 1929,
			hash: 'hash-unrelated-photo',
			acknowledged: false,
			files: [
				{
					id: 19291,
					path: '/Photos/Vacations/beach_sunset.jpg',
					size: 5 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
				{
					id: 19292,
					path: '/Photos/Exports/beach_sunset.jpg',
					size: 5 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
	]
}

describe('Cycle 192: Financial, Accounting & Tax Compliance Vault Auditor', () => {
	test('classifies FEC (.txt/.tsv), bank feeds (.ofx/.qif/.mt940/.camt.xml/.csv), invoices/liasses (.pdf), and accounting workbooks (.xlsx/.xlsm/.ods)', () => {
		const {
			classifyFinanceTaxFile,
			isFinanceTaxGroup,
			extractFinanceSiren,
			extractFiscalYear,
			extractFinanceDocumentStem,
		} = loadFinanceTaxVaultModule()

		const fec = classifyFinanceTaxFile({ path: '/Archives_Fiscales_10ans/FEC/123456789FEC20241231.txt', size: 1024 })
		assert.equal(fec.family, 'fec-statutory-exports')
		assert.equal(fec.isFecArchive, true)
		assert.equal(fec.siren, '123456789')
		assert.equal(fec.fiscalYear, 'FY2024')

		const fecTsv = classifyFinanceTaxFile({ path: '/DGFiP/987654321FEC20231231.tsv', size: 1024 })
		assert.equal(fecTsv.family, 'fec-statutory-exports')
		assert.equal(fecTsv.isFecArchive, true)

		const bankOfx = classifyFinanceTaxFile({ path: '/Tresorerie/releve_2024_10.ofx', size: 1024 })
		assert.equal(bankOfx.family, 'bank-statements-feeds')
		assert.equal(bankOfx.artifactKind, 'ofx-qif-statement')

		const bankQif = classifyFinanceTaxFile({ path: '/Tresorerie/compte_pro.qif', size: 1024 })
		assert.equal(bankQif.family, 'bank-statements-feeds')

		const bankCamt = classifyFinanceTaxFile({ path: '/Releves_Bancaires/bnp_2024.camt.xml', size: 1024 })
		assert.equal(bankCamt.family, 'bank-statements-feeds')
		assert.equal(bankCamt.complianceTag, 'camt-iso20022')

		const bankCsv = classifyFinanceTaxFile({ path: '/Tresorerie/extrait_compte_iban_2024_reexport.csv', size: 1024 })
		assert.equal(bankCsv.family, 'bank-statements-feeds')
		assert.equal(bankCsv.isScannedOrReexportCopy, true)
		assert.equal(bankCsv.isMutableWorkbook, true)

		const signedInvoice = classifyFinanceTaxFile({ path: '/Archives_Fiscales_10ans/Factures/facture_F2024-0812_facturx_signe.pdf', size: 1024 })
		assert.equal(signedInvoice.family, 'invoices-liasses-pdf')
		assert.equal(signedInvoice.isSignedJustificatif, true)

		const scannedInvoice = classifyFinanceTaxFile({ path: '/Compta/Scans/facture_F2024-0812_scan.pdf', size: 1024 })
		assert.equal(scannedInvoice.family, 'invoices-liasses-pdf')
		assert.equal(scannedInvoice.isScannedOrReexportCopy, true)

		const closedBilan = classifyFinanceTaxFile({ path: '/Archives_Fiscales_10ans/Bilans/bilan_cloture_FY2024_definitif.xlsm', size: 1024 })
		assert.equal(closedBilan.family, 'accounting-workbooks')
		assert.equal(closedBilan.isClosedBilan, true)
		assert.equal(closedBilan.isMutableWorkbook, true)

		const closedOds = classifyFinanceTaxFile({ path: '/Compta/Cloture/balance_generale_cloture_2024.ods', size: 1024 })
		assert.equal(closedOds.family, 'accounting-workbooks')
		assert.equal(closedOds.isClosedBilan, true)

		const unrelated = classifyFinanceTaxFile({ path: '/Photos/Vacations/beach_sunset.jpg', size: 1024 })
		assert.equal(unrelated.family, null)

		assert.equal(extractFinanceSiren('/FEC/123456789FEC20241231.txt', '123456789FEC20241231.txt'), '123456789')
		assert.equal(extractFiscalYear('/Bilans/bilan_FY2024.xlsx', 'bilan_FY2024.xlsx'), 'FY2024')
		assert.equal(
			extractFinanceDocumentStem('facture_F2024-0812_facturx_signe.pdf'),
			extractFinanceDocumentStem('facture_F2024-0812_scan.pdf')
		)
		assert.equal(isFinanceTaxGroup({ files: [{ path: '/Photos/a.jpg' }] }), false)
	})

	test('strictly shields FEC archives, signed justificatifs, closed bilans, and blocks unanchored scan deletion', () => {
		const { auditFinanceTaxVault } = loadFinanceTaxVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleFinanceTaxDuplicates(nowMs)

		const report = auditFinanceTaxVault(groups, {}, nowMs)
		assert.equal(report.schema, 'duplicatefinder.finance-tax-vault-auditor.v1')
		assert.equal(report.summary.totalDomainGroupsCount, 8)
		assert.equal(report.summary.totalFecArchiveClusters, 2)
		assert.equal(report.summary.totalSignedJustificatifClusters, 2)
		assert.equal(report.summary.totalClosedBilanClusters, 2)

		// FEC archive copy in /Archives_Fiscales_10ans/ is strictly shielded; staging reexport is reclaimable
		const fecCluster = report.clusters.find(c => c.id === 1921)
		assert.ok(fecCluster)
		assert.equal(fecCluster.clusterVerdict, 'fec-archive-protected')
		assert.equal(fecCluster.survivorPath, '/Archives_Fiscales_10ans/FEC/123456789FEC20241231.txt')
		const fecArchive = fecCluster.members.find(m => m.id === 19211)
		const fecStaging = fecCluster.members.find(m => m.id === 19212)
		assert.equal(fecArchive.shielded, true)
		assert.equal(fecArchive.action, 'keep')
		assert.equal(fecStaging.shielded, false)
		assert.equal(fecStaging.action, 'delete')

		// Dual canonical FEC archives in /DGFiP and /Coffrefort are BOTH shielded
		const dualFec = report.clusters.find(c => c.id === 1922)
		assert.ok(dualFec)
		assert.equal(dualFec.reclaimableBytes, 0)
		assert.equal(dualFec.members.every(m => m.shielded && m.action === 'keep'), true)

		// Signed Factur-X invoice is shielded, while scanned and re-exported duplicates are reclaimable
		const invoiceCluster = report.clusters.find(c => c.id === 1923)
		assert.ok(invoiceCluster)
		assert.equal(invoiceCluster.clusterVerdict, 'signed-justificatif-protected')
		assert.equal(invoiceCluster.hasVerifiedArchiveAnchor, true)
		assert.equal(invoiceCluster.members.find(m => m.id === 19231).shielded, true)
		assert.equal(invoiceCluster.members.find(m => m.id === 19232).action, 'delete')
		assert.equal(invoiceCluster.members.find(m => m.id === 19233).action, 'delete')

		// Unanchored scanned avoir (no signed/10yr archive anchor) is blocked when requireVerifiedArchiveAnchor=true
		const unanchoredAvoir = report.clusters.find(c => c.id === 1924)
		assert.ok(unanchoredAvoir)
		assert.equal(unanchoredAvoir.hasVerifiedArchiveAnchor, false)
		assert.equal(unanchoredAvoir.members.find(m => m.id === 19242).shielded, true)
		assert.equal(unanchoredAvoir.reclaimableBytes, 0)

		// Unblocking requireVerifiedArchiveAnchor allows reclaiming the OCR scan of the avoir
		const unblockedReport = auditFinanceTaxVault(groups, { requireVerifiedArchiveAnchor: false }, nowMs)
		const unblockedAvoir = unblockedReport.clusters.find(c => c.id === 1924)
		assert.equal(unblockedAvoir.members.find(m => m.id === 19242).action, 'delete')

		// Closed liasse 2050 PDF in /Coffrefort is strictly shielded (both copies are in closed/vault status or non-staging)
		const closedLiasse = report.clusters.find(c => c.id === 1928)
		assert.ok(closedLiasse)
		assert.equal(closedLiasse.clusterVerdict, 'closed-bilan-protected')
		assert.equal(closedLiasse.reclaimableBytes, 0)
	})

	test('blocks hardlinking mutable accounting workbooks/CSVs and builds DRY_RUN=1 script, CWE-1236 CSV, JSON manifest, and .sync-exclude.lst', () => {
		const {
			auditFinanceTaxVault,
			buildFinanceTaxRemediationScript,
			buildFinanceTaxCsvReport,
			buildFinanceTaxJsonManifest,
			buildFinanceTaxSyncExcludeList,
		} = loadFinanceTaxVaultModule()

		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleFinanceTaxDuplicates(nowMs)
		const hardlinkAudit = auditFinanceTaxVault(groups, {
			strategy: 'hardlink-immutable-archives',
		}, nowMs)

		// Immutable PDF scan can be hardlinked, whereas mutable .xlsx draft must NOT be hardlinked
		const invoiceCluster = hardlinkAudit.clusters.find(c => c.id === 1923)
		assert.equal(invoiceCluster.members.find(m => m.id === 19232).action, 'hardlink')

		const bilanCluster = hardlinkAudit.clusters.find(c => c.id === 1927)
		const bilanDraft = bilanCluster.members.find(m => m.id === 19272)
		assert.equal(bilanDraft.isMutableWorkbook, true)
		assert.notEqual(bilanDraft.action, 'hardlink')

		const script = buildFinanceTaxRemediationScript(hardlinkAudit)
		assert.match(script, /^#!\/usr\/bin\/env bash/m)
		assert.match(script, /DRY_RUN="\$\{DRY_RUN:-1\}"/)
		assert.match(script, /run_cmd ln -f '[^']*facture_F2024-0812_facturx_signe\.pdf' '[^']*facture_F2024-0812_scan\.pdf'/)
		assert.equal(/run_cmd (?:rm|ln)[^\n]*123456789FEC20241231\.txt'/.test(script), false)
		assert.equal(/run_cmd rm -f[^\n]*facture_F2024-0812_facturx_signe\.pdf/.test(script), false)
		assert.equal(/run_cmd ln -f '[^']+' '[^']*facture_F2024-0812_facturx_signe\.pdf'/.test(script), false)
		assert.equal(/run_cmd (?:rm|ln)[^\n]*bilan_cloture_FY2024_definitif\.xlsx/.test(script), false)

		const pruneAudit = auditFinanceTaxVault(groups, {}, nowMs)
		const pruneScript = buildFinanceTaxRemediationScript(pruneAudit)
		assert.equal(/run_cmd rm -f[^\n]*(?:123456789FEC20241231\.txt|facture_F2024-0812_facturx_signe\.pdf|bilan_cloture_FY2024_definitif\.xlsx)/.test(pruneScript), false)

		// CWE-1236 formula injection defense in CSV report
		const maliciousGroup = [
			{
				id: 19298,
				hash: 'hash-cwe1236-eq',
				files: [
					{ id: 1, path: '/Compta/Factures/=CMD("calc")_facture_signe.pdf', size: 1024, mtime: 1700000000 },
					{ id: 2, path: '/Compta/Scans/facture_scan.pdf', size: 1024, mtime: 1700000000 },
				],
			},
			{
				id: 19299,
				hash: 'hash-cwe1236-plus',
				files: [
					{ id: 3, path: '/Compta/Scans/+SUM(A1:A2)_facture_scan.pdf', size: 1024, mtime: 1700000000 },
					{ id: 4, path: '/Compta/Factures/facture_sum_signe.pdf', size: 1024, mtime: 1700000000 },
				],
			},
		]
		const maliciousAudit = auditFinanceTaxVault(maliciousGroup, {}, nowMs)
		const csv = buildFinanceTaxCsvReport(maliciousAudit)
		assert.match(csv, /"'=CMD/)
		assert.match(csv, /"'\+SUM/)

		const manifest = JSON.parse(buildFinanceTaxJsonManifest(hardlinkAudit))
		assert.equal(manifest.schema, 'duplicatefinder.finance-tax-vault-auditor.v1')
		assert.equal(manifest.clusters.length, 8)

		const syncExclude = buildFinanceTaxSyncExcludeList()
		assert.match(syncExclude, /~\$\*\.xlsx/)
		assert.match(syncExclude, /\.~lock\.\*\.ods#/)
		assert.match(syncExclude, /\*_reexport\.txt/)
		assert.match(syncExclude, /\*_scan\.pdf/)
	})

	test('FinanceTaxVaultWorkbench Vue component renders KPIs, controls, overrides, and exports cleanly', async () => {
		const copiedPayloads = []
		const Workbench = loadFinanceTaxVaultWorkbench(copiedPayloads)
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const duplicates = buildSampleFinanceTaxDuplicates(nowMs)

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates,
					allDuplicates: duplicates,
					currentDuplicateId: 1921,
				},
			}),
		}).$mount(mountNode)

		try {
			await settle()

			const rootEl = vm.$el
			assert.ok(rootEl.classList.contains('finance-tax-vault-workbench'))
			assert.match(rootEl.textContent, /Financial, Accounting & Tax Compliance Vault Auditor/)
			assert.match(rootEl.textContent, /123456789FEC20241231\.txt/)

			// Controlled numeric input must accept empty string mid-typing without snapping back
			const graceInput = rootEl.querySelector('input.ftv__num-input')
			graceInput.value = ''
			graceInput.dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(graceInput.value, '')

			// Copy DRY_RUN=1 script button works
			const copyScriptBtn = Array.from(rootEl.querySelectorAll('button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			assert.ok(copyScriptBtn)
			copyScriptBtn.click()
			await settle()
			assert.equal(copiedPayloads.length, 1)
			assert.match(copiedPayloads[0], /DRY_RUN="\$\{DRY_RUN:-1\}"/)

			// Copy .sync-exclude.lst button works
			const copySyncBtn = Array.from(rootEl.querySelectorAll('button')).find(b => b.textContent.includes('Copy .sync-exclude.lst'))
			assert.ok(copySyncBtn)
			copySyncBtn.click()
			await settle()
			assert.equal(copiedPayloads.length, 2)
			assert.match(copiedPayloads[1], /~\$\*\.xlsx/)

			// Per-copy override select works for non-shielded member
			const overrideSelect = rootEl.querySelector('select.ftv__override-select')
			assert.ok(overrideSelect)
			overrideSelect.value = 'keep'
			overrideSelect.dispatchEvent(new window.Event('change'))
			await settle()
			assert.match(rootEl.textContent, /Manually shielded via per-copy override/)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue wires FinanceTaxVaultWorkbench with Shift+F6 shortcut cleanly', async () => {
		const icon = { render: h => h('span') }
		const slotBox = tag => ({ render(h) { return h(tag, this.$slots.default) } })
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'isScanning'],
			render(h) {
				return h('div', { class: `stub-${name}` })
			},
		})

		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
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
			'@/tools/api': { fetchDuplicates: async () => ({ entities: [], pagination: { currentPage: 1, totalPages: 1 } }) },
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

		const FinanceTaxVaultWorkbench = loadFinanceTaxVaultWorkbench()

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
			'./components/FinanceTaxVaultWorkbench.vue': { __esModule: true, default: FinanceTaxVaultWorkbench },
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
			'./components/RailwaySignalingTelemetryVaultWorkbench.vue': { __esModule: true, default: stub('railway-signaling-telemetry-vault-auditor') },
			'./components/SpeechAsrBioacousticsVaultWorkbench.vue': { __esModule: true, default: stub('speech-asr-bioacoustics-vault-auditor') },
			'./components/TrafficItsV2xVaultWorkbench.vue': { __esModule: true, default: stub('traffic-its-v2x-vault-auditor') },
			'./components/UrbanWaterUtilityPipelineVaultWorkbench.vue': { __esModule: true, default: stub('urban-water-utility-pipeline-vault-auditor') },
			'./components/VeterinaryEquineGenomicsVaultWorkbench.vue': { __esModule: true, default: stub('veterinary-equine-genomics-vault-auditor') },
			'./components/WineEnologyHaccpVaultWorkbench.vue': { __esModule: true, default: stub('wine-enology-haccp-vault-auditor') },
			'./components/XrSpatialNerfSplatVaultWorkbench.vue': { __esModule: true, default: stub('xr-spatial-nerf-splat-vault-auditor') },
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
					entities: type === 'unacknowledged' ? buildSampleFinanceTaxDuplicates() : [],
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

			const btn = vm.$el.querySelector('button.topbar-finance-tax-vault-button')
			assert.ok(btn, 'Finance & Tax Vault button is rendered in topbar')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Shift+F6')
			assert.equal(vm.$el.querySelector('.finance-tax-vault-workbench'), null)

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F6', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.ok(vm.$el.querySelector('.finance-tax-vault-workbench'), 'FinanceTaxVaultWorkbench must open on Shift+F6 shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F6', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.$el.querySelector('.finance-tax-vault-workbench'), null, 'FinanceTaxVaultWorkbench must toggle closed on Shift+F6 shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Financial, Accounting & Tax Compliance Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/financeTaxVaultAuditor.js',
			'src/components/FinanceTaxVaultWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `No U+2013/U+2014 in ${rel}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `No XSS sink in ${rel}`)
		}
	})
})
