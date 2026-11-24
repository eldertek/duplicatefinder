const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

/**
 * Load the pure Database Dump, SQL Backup & Telemetry Log Vault auditor module.
 *
 * @return {object} Loaded module exports.
 */
function loadDbSqlLogVaultModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateStats': duplicateStats,
	})
	return loadModule('src/tools/dbSqlLogVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

/**
 * Load DbSqlLogVaultWorkbench Vue component with mocked clipboard helper.
 *
 * @param {Array<string>} [copiedPayloads] Array collecting copied strings.
 * @return {object} Loaded Vue component definition.
 */
function loadDbSqlLogVaultWorkbench(copiedPayloads = []) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateStats': duplicateStats,
	})
	const dbSqlLogVaultAuditor = loadModule('src/tools/dbSqlLogVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/DbSqlLogVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async (text) => {
				copiedPayloads.push(text)
				return true
			},
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/dbSqlLogVaultAuditor': dbSqlLogVaultAuditor,
	})
}

/**
 * Build deterministic SQL dump, active DB+WAL, GFS snapshot, and telemetry log duplicate clusters.
 *
 * @param {number} [nowMs] Reference epoch milliseconds.
 * @return {Array<object>} Sample duplicate groups.
 */
function buildSampleDbSqlLogDuplicates(nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)) {
	const oneDayAgo = Math.floor((nowMs - 1 * 24 * 60 * 60 * 1000) / 1000)
	const tenDaysAgo = Math.floor((nowMs - 10 * 24 * 60 * 60 * 1000) / 1000)
	const sixtyDaysAgo = Math.floor((nowMs - 60 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 901,
			hash: 'hash-active-sqlite-db',
			acknowledged: false,
			files: [
				{
					id: 9011,
					path: '/var/lib/nextcloud/data/billing.sqlite',
					size: 512 * 1024 * 1024,
					mtime: oneDayAgo,
				},
				{
					id: 9012,
					path: '/tmp/stale/billing.sqlite',
					size: 512 * 1024 * 1024,
					mtime: sixtyDaysAgo,
				},
			],
		},
		{
			id: 902,
			hash: 'hash-active-sqlite-wal',
			acknowledged: false,
			files: [
				{
					id: 9021,
					path: '/var/lib/nextcloud/data/billing.sqlite-wal',
					size: 64 * 1024 * 1024,
					mtime: oneDayAgo,
				},
				{
					id: 9022,
					path: '/var/lib/nextcloud/data/billing.shm',
					size: 64 * 1024 * 1024,
					mtime: oneDayAgo,
				},
			],
		},
		{
			id: 903,
			hash: 'hash-latest-healthy-zst',
			acknowledged: false,
			files: [
				{
					id: 9031,
					path: '/srv/backups/gfs/orders-2026-11-24.sql.zst',
					size: 4 * 1024 * 1024 * 1024,
					mtime: oneDayAgo,
				},
				{
					id: 9032,
					path: '/tmp/scratch/orders-2026-11-24.sql.zst',
					size: 4 * 1024 * 1024 * 1024,
					mtime: oneDayAgo,
				},
			],
		},
		{
			id: 904,
			hash: 'hash-gfs-monthly-father',
			acknowledged: false,
			files: [
				{
					id: 9041,
					path: '/srv/backups/monthly/orders-2026-11-01.sql.gz',
					size: 3 * 1024 * 1024 * 1024,
					mtime: tenDaysAgo,
				},
				{
					id: 9042,
					path: '/srv/compliance/soc2/orders-2026-11-01.sql.gz',
					size: 3 * 1024 * 1024 * 1024,
					mtime: tenDaysAgo,
				},
			],
		},
		{
			id: 905,
			hash: 'hash-redundant-daily-sql',
			acknowledged: false,
			files: [
				{
					id: 9051,
					path: '/srv/backups/daily/orders-2026-11-10.sql',
					size: 6 * 1024 * 1024 * 1024,
					mtime: tenDaysAgo,
				},
				{
					id: 9052,
					path: '/tmp/scratch/orders-2026-11-10.sql',
					size: 6 * 1024 * 1024 * 1024,
					mtime: tenDaysAgo,
				},
			],
		},
		{
			id: 906,
			hash: 'hash-gfs-annual-dump',
			acknowledged: false,
			files: [
				{
					id: 9061,
					path: '/srv/backups/annual/orders-2026-01-01.dump',
					size: 2 * 1024 * 1024 * 1024,
					mtime: sixtyDaysAgo,
				},
				{
					id: 9062,
					path: '/srv/tmp/orders-2026-01-01.bak',
					size: 2 * 1024 * 1024 * 1024,
					mtime: sixtyDaysAgo,
				},
			],
		},
		{
			id: 907,
			hash: 'hash-telemetry-ndjson-logs',
			acknowledged: false,
			files: [
				{
					id: 9071,
					path: '/srv/logs/gateway/access.log.gz',
					size: 400 * 1024 * 1024,
					mtime: tenDaysAgo,
				},
				{
					id: 9072,
					path: '/tmp/debug/events.ndjson',
					size: 400 * 1024 * 1024,
					mtime: tenDaysAgo,
				},
			],
		},
		{
			id: 908,
			hash: 'hash-pcap-capture',
			acknowledged: false,
			files: [
				{
					id: 9081,
					path: '/srv/compliance/audit/eth0-capture.pcapng',
					size: 900 * 1024 * 1024,
					mtime: tenDaysAgo,
				},
				{
					id: 9082,
					path: '/tmp/captures/eth0-capture.pcap',
					size: 900 * 1024 * 1024,
					mtime: tenDaysAgo,
				},
			],
		},
		{
			id: 909,
			hash: 'hash-unrelated-photo',
			acknowledged: false,
			files: [
				{
					id: 9091,
					path: '/srv/photos/vacation.jpg',
					size: 5 * 1024 * 1024,
					mtime: oneDayAgo,
				},
				{
					id: 9092,
					path: '/srv/photos/backup/vacation.jpg',
					size: 5 * 1024 * 1024,
					mtime: oneDayAgo,
				},
			],
		},
	]
}

describe('Cycle 189: Database Dump, SQL Backup & Telemetry Log Vault Auditor', () => {
	test('classifies SQL dumps, active DB+WAL/SHM, GFS tiers, and telemetry logs accurately while excluding unrelated files', () => {
		const mod = loadDbSqlLogVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)

		const sqlZst = mod.classifyDbSqlLogFile({ path: '/srv/backups/orders-2026-11-24.sql.zst', size: 1024 }, nowMs)
		assert.equal(sqlZst.family, 'sql-backup-dumps')
		assert.equal(sqlZst.artifactKind, 'compressed-sql-dump')
		assert.equal(sqlZst.gfsTier, 'son-daily')
		assert.equal(sqlZst.snapshotDate, '2026-11-24')

		const monthlySql = mod.classifyDbSqlLogFile({ path: '/srv/backups/monthly/orders-2026-11-01.sql.gz', size: 1024 }, nowMs)
		assert.equal(monthlySql.family, 'sql-backup-dumps')
		assert.equal(monthlySql.gfsTier, 'father-monthly')
		assert.equal(monthlySql.isGfsProtectedTier, true)

		const annualDump = mod.classifyDbSqlLogFile({ path: '/srv/backups/annual/orders-2026-01-01.dump', size: 1024 }, nowMs)
		assert.equal(annualDump.family, 'sql-backup-dumps')
		assert.equal(annualDump.gfsTier, 'grandfather-annual')
		assert.equal(annualDump.isGfsProtectedTier, true)

		const sqliteDb = mod.classifyDbSqlLogFile({ path: '/var/lib/app/billing.sqlite', size: 1024 }, nowMs)
		assert.equal(sqliteDb.family, 'active-sqlite-wal')
		assert.equal(sqliteDb.isMutableDatabaseFile, true)

		const walFile = mod.classifyDbSqlLogFile({ path: '/var/lib/app/billing.sqlite-wal', size: 1024 }, nowMs)
		assert.equal(walFile.family, 'active-sqlite-wal')
		assert.equal(walFile.isWalOrShm, true)

		const ndjsonFile = mod.classifyDbSqlLogFile({ path: '/srv/logs/metrics.ndjson', size: 1024 }, nowMs)
		assert.equal(ndjsonFile.family, 'service-and-ndjson-logs')
		assert.equal(ndjsonFile.artifactKind, 'ndjson-telemetry-log')

		const pcapFile = mod.classifyDbSqlLogFile({ path: '/srv/audit/capture.pcapng', size: 1024 }, nowMs)
		assert.equal(pcapFile.family, 'packet-and-telemetry-captures')
		assert.equal(pcapFile.artifactKind, 'pcapng-capture')

		const unrelated = mod.classifyDbSqlLogFile({ path: '/srv/photos/portrait.png', size: 1024 }, nowMs)
		assert.equal(unrelated.family, null)
	})

	test('strictly protects active DB+WAL/SHM, latest healthy backup, GFS monthly/annual, and compliance archives while reclaiming redundant daily/scratch copies', () => {
		const mod = loadDbSqlLogVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleDbSqlLogDuplicates(nowMs)

		const audit = mod.auditDbSqlLogVault(groups, {}, nowMs)
		assert.equal(audit.schema, mod.DB_SQL_LOG_VAULT_SCHEMA)
		assert.equal(audit.summary.totalDomainGroupsCount, 8)
		assert.equal(audit.familyCounts['sql-backup-dumps'], 4)
		assert.equal(audit.familyCounts['active-sqlite-wal'], 2)
		assert.equal(audit.familyCounts['service-and-ndjson-logs'], 1)
		assert.equal(audit.familyCounts['packet-and-telemetry-captures'], 1)

		// Active SQLite DB: live copy protected, stale copy in /tmp/stale/ reclaimable
		const activeDbCluster = audit.clusters.find(c => c.id === 901)
		assert.ok(activeDbCluster)
		assert.equal(activeDbCluster.clusterVerdict, 'active-db-wal-protected')
		assert.equal(activeDbCluster.hasActiveDbWal, true)
		const liveSqlite = activeDbCluster.members.find(m => m.id === 9011)
		const staleSqlite = activeDbCluster.members.find(m => m.id === 9012)
		assert.equal(liveSqlite.action, 'keep')
		assert.equal(liveSqlite.shielded, true)
		assert.equal(staleSqlite.action, 'delete')

		// Active WAL & SHM paired with live DB: both strictly shielded
		const walCluster = audit.clusters.find(c => c.id === 902)
		assert.ok(walCluster)
		assert.equal(walCluster.clusterVerdict, 'active-db-wal-protected')
		assert.equal(walCluster.reclaimableTargetsCount, 0)
		assert.ok(walCluster.members.every(m => m.action === 'keep' && m.shielded))

		// Latest healthy backup: canonical vault anchor protected, scratch duplicate reclaimed
		const latestCluster = audit.clusters.find(c => c.id === 903)
		assert.ok(latestCluster)
		const canonicalLatest = latestCluster.members.find(m => m.id === 9031)
		const scratchLatest = latestCluster.members.find(m => m.id === 9032)
		assert.equal(canonicalLatest.isLatestHealthyBackup, true)
		assert.equal(canonicalLatest.action, 'keep')
		assert.equal(scratchLatest.action, 'delete')

		// GFS monthly + compliance archive: both copies shielded
		const gfsMonthlyCluster = audit.clusters.find(c => c.id === 904)
		assert.ok(gfsMonthlyCluster)
		assert.equal(gfsMonthlyCluster.reclaimableTargetsCount, 0)
		assert.ok(gfsMonthlyCluster.members.every(m => m.action === 'keep' && m.shielded))

		// Redundant daily SQL dump: one survivor kept, scratch copy reclaimed
		const dailyCluster = audit.clusters.find(c => c.id === 905)
		assert.ok(dailyCluster)
		assert.equal(dailyCluster.clusterVerdict, 'redundant-daily-dump')
		assert.equal(dailyCluster.reclaimableTargetsCount, 1)

		// Compliance PCAP: compliance archive kept, /tmp copy reclaimed
		const pcapCluster = audit.clusters.find(c => c.id === 908)
		assert.ok(pcapCluster)
		assert.equal(pcapCluster.hasComplianceArchive, true)
		assert.equal(pcapCluster.members.find(m => m.id === 9081).action, 'keep')
		assert.equal(pcapCluster.members.find(m => m.id === 9082).action, 'delete')
	})

	test('hardlink strategy consolidates immutable archives/logs and blocks hardlinks on mutable .sqlite/.db/.wal/.shm', () => {
		const mod = loadDbSqlLogVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleDbSqlLogDuplicates(nowMs)

		const audit = mod.auditDbSqlLogVault(groups, {
			strategy: 'hardlink-immutable-archives',
		}, nowMs)

		const activeDbCluster = audit.clusters.find(c => c.id === 901)
		assert.equal(activeDbCluster.reclaimableTargetsCount, 0)
		assert.ok(activeDbCluster.members.every(m => m.action === 'keep'))

		const logCluster = audit.clusters.find(c => c.id === 907)
		assert.equal(logCluster.hardlinkTargetsCount, 1)
		assert.equal(logCluster.members.find(m => m.action === 'hardlink').id, 9072)
	})

	test('generates safe DRY_RUN=1 script, CWE-1236 CSV, JSON manifest, and .sync-exclude.lst rules', () => {
		const mod = loadDbSqlLogVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = [
			{
				id: 950,
				hash: 'hash-cwe-test',
				files: [
					{ id: 9501, path: '/srv/backups/daily/db-2026-11-10.sql.zst', size: 1024 * 1024, mtime: Math.floor(nowMs / 1000) },
					{ id: 9502, path: '/tmp/scratch/=cmd|calc!A0.sql', size: 1024 * 1024, mtime: Math.floor(nowMs / 1000) },
				],
			},
		]

		const audit = mod.auditDbSqlLogVault(groups, {}, nowMs)
		const script = mod.buildDbSqlLogRemediationScript(audit)
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes("run_cmd rm -f '/tmp/scratch/=cmd|calc!A0.sql'"))
		assert.ok(!script.includes("rm -f '/srv/backups/daily/db-2026-11-10.sql.zst'"))

		const csv = mod.buildDbSqlLogCsvReport(audit)
		assert.ok(csv.includes('cluster_id,cluster_name,db_stem'))
		assert.ok(csv.includes("'/tmp/scratch/=cmd|calc!A0.sql'") || csv.includes('"/tmp/scratch/=cmd|calc!A0.sql"') || csv.includes('/tmp/scratch/=cmd|calc!A0.sql'))

		// Direct formula-start cell check for CWE-1236
		const formulaInjectionAudit = mod.auditDbSqlLogVault([
			{
				id: 951,
				hash: 'hash-formula',
				files: [
					{ id: 9511, path: '=HYPERLINK("http://evil").sql', size: 2048, mtime: Math.floor(nowMs / 1000) },
					{ id: 9512, path: '/srv/backups/safe.sql', size: 2048, mtime: Math.floor(nowMs / 1000) },
				],
			},
		], {}, nowMs)
		const formulaCsv = mod.buildDbSqlLogCsvReport(formulaInjectionAudit)
		assert.ok(formulaCsv.includes("'=HYPERLINK"))

		const json = JSON.parse(mod.buildDbSqlLogJsonManifest(audit))
		assert.equal(json.schema, mod.DB_SQL_LOG_VAULT_SCHEMA)
		assert.equal(json.clusters.length, 1)

		const syncExclude = mod.buildDbSqlLogSyncExcludeList()
		assert.ok(syncExclude.includes('*.sqlite-wal'))
		assert.ok(syncExclude.includes('*.sqlite-shm'))
		assert.ok(syncExclude.includes('*.ndjson'))
		assert.ok(syncExclude.includes('*.pcapng'))
	})

	test('DbSqlLogVaultWorkbench.vue renders empty/populated states, handles presets/filters/overrides, and emits actions cleanly', async () => {
		const copied = []
		const Workbench = loadDbSqlLogVaultWorkbench(copied)

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
			assert.ok(emptyVm.$el.querySelector('.dslv__empty-banner'))
		} finally {
			emptyVm.$destroy()
			emptyNode.remove()
		}

		// Populated state
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const duplicates = buildSampleDbSqlLogDuplicates(nowMs)
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
			assert.ok(wb.$el.querySelector('.dslv__workspace'))
			assert.ok(wb.$el.querySelectorAll('.dslv__cluster-card').length >= 6)

			// Numeric input must not clamp mid-keystroke
			wb.keepDailyInput = ''
			await settle()
			assert.equal(wb.keepDailyInput, '')
			assert.equal(wb.parsedKeepDaily, 7)

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

	test('App.vue wires DbSqlLogVaultWorkbench with Shift+F8 shortcut cleanly', async () => {
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
		const DbSqlLogVaultWorkbench = loadDbSqlLogVaultWorkbench()

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
			'./components/DbSqlLogVaultWorkbench.vue': { __esModule: true, default: DbSqlLogVaultWorkbench },
			'./components/BroadcastNleVaultWorkbench.vue': { __esModule: true, default: stub('broadcast-nle-vault-auditor') },
			'./components/EcommercePimVaultWorkbench.vue': { __esModule: true, default: stub('ecommerce-pim-vault-auditor') },
			'./components/FinanceTaxVaultWorkbench.vue': { __esModule: true, default: stub('finance-tax-vault-auditor') },
			'./components/IotFirmwareVaultWorkbench.vue': { __esModule: true, default: stub('iot-firmware-vault-auditor') },
			'./components/MobileBuildVaultWorkbench.vue': { __esModule: true, default: stub('mobile-build-vault-auditor') },
			'./components/K8sTerraformVaultWorkbench.vue': { __esModule: true, default: stub('k8s-terraform-vault-auditor') },
			'./components/PublishingPrepressVaultWorkbench.vue': { __esModule: true, default: stub('publishing-prepress-vault-auditor') },
			'./components/GenomicsBioinformaticsVaultWorkbench.vue': { __esModule: true, default: stub('genomics-bioinformatics-vault-auditor') },
			'./components/DfirSecurityVaultWorkbench.vue': { __esModule: true, default: stub('dfir-security-vault-auditor') },
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
					entities: type === 'unacknowledged' ? buildSampleDbSqlLogDuplicates() : [],
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

			const btn = vm.$el.querySelector('button.topbar-db-sql-log-vault-button')
			assert.ok(btn, 'SQL & Telemetry Vault button is rendered in topbar')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Shift+F8')
			assert.equal(vm.$el.querySelector('.db-sql-log-vault-workbench'), null)

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F8', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.ok(vm.$el.querySelector('.db-sql-log-vault-workbench'), 'DbSqlLogVaultWorkbench must open on Shift+F8 shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F8', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.$el.querySelector('.db-sql-log-vault-workbench'), null, 'DbSqlLogVaultWorkbench must toggle closed on Shift+F8 shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Database Dump, SQL Backup & Telemetry Log Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/dbSqlLogVaultAuditor.js',
			'src/components/DbSqlLogVaultWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `No U+2013/U+2014 in ${rel}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `No XSS sink in ${rel}`)
		}
	})
})
