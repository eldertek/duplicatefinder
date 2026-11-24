const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadDatabaseDumpLogModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/databaseDumpLogAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadDatabaseDumpLogWorkbench(clipboardImpl) {
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const databaseDumpLogAuditor = loadDatabaseDumpLogModule()
	return loadComponent('src/components/DatabaseDumpLogWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/databaseDumpLogAuditor': databaseDumpLogAuditor,
	})
}

function buildSampleDatabaseDumpLogDuplicates() {
	const mib = 1024 * 1024
	const refSec = 1796000000
	return [
		{
			id: 9901,
			hash: 'sha256-nextcloud-prod-2026-11-24-zst',
			size: 256 * mib,
			acknowledged: false,
			files: [
				{
					id: 99011,
					path: '/__groupfolders/14/db-backups/nextcloud_prod_2026-11-24.sql.zst',
					size: 256 * mib,
					mtime: refSec - 1 * 86400,
				},
				{
					id: 99012,
					path: '/archive/db-backups/nextcloud_prod_2026-11-24.sql.zst',
					size: 256 * mib,
					mtime: refSec - 1 * 86400,
				},
				{
					id: 99013,
					path: '/alice/files/Downloads/nextcloud_prod_2026-11-24.sql.zst',
					size: 256 * mib,
					mtime: refSec - 1 * 86400,
				},
			],
		},
		{
			id: 9902,
			hash: 'sha256-nextcloud-prod-2026-11-24-sha256-sidecar',
			size: 128,
			acknowledged: false,
			files: [
				{
					id: 99021,
					path: '/__groupfolders/14/db-backups/nextcloud_prod_2026-11-24.sql.zst.sha256',
					size: 128,
					mtime: refSec - 1 * 86400,
				},
				{
					id: 99022,
					path: '/archive/db-backups/nextcloud_prod_2026-11-24.sql.zst.sha256',
					size: 128,
					mtime: refSec - 1 * 86400,
				},
			],
		},
		{
			id: 9903,
			hash: 'sha256-nextcloud-prod-2026-11-24-plain-sql-verified',
			size: 1024 * mib,
			acknowledged: false,
			files: [
				{
					id: 99031,
					path: '/db-backups/staging/nextcloud_prod_2026-11-24.sql',
					size: 1024 * mib,
					mtime: refSec - 1 * 86400,
				},
				{
					id: 99032,
					path: '/alice/files/Downloads/nextcloud_prod_2026-11-24.sql',
					size: 1024 * mib,
					mtime: refSec - 1 * 86400,
				},
			],
		},
		{
			id: 9904,
			hash: 'sha256-billing-orphan-plain-dump-unverified',
			size: 512 * mib,
			acknowledged: false,
			files: [
				{
					id: 99041,
					path: '/db-backups/legacy/billing_2026-10-15.dump',
					size: 512 * mib,
					mtime: refSec - 40 * 86400,
				},
				{
					id: 99042,
					path: '/Downloads/billing_2026-10-15.dump',
					size: 512 * mib,
					mtime: refSec - 35 * 86400,
				},
			],
		},
		{
			id: 9905,
			hash: 'sha256-stale-wal-and-pgwal-artifacts',
			size: 64 * mib,
			acknowledged: false,
			files: [
				{
					id: 99051,
					path: '/db-backups/wal/app_cache.sqlite-wal',
					size: 64 * mib,
					mtime: refSec - 20 * 86400,
				},
				{
					id: 99052,
					path: '/db-backups/wal/pg_wal/000000010000000F000000A1.ready',
					size: 64 * mib,
					mtime: refSec - 20 * 86400,
				},
				{
					id: 99053,
					path: '/db-backups/wal/ib_logfile0',
					size: 64 * mib,
					mtime: refSec - 22 * 86400,
				},
				{
					id: 99054,
					path: '/db-backups/wal/nightly.dump.part',
					size: 64 * mib,
					mtime: refSec - 25 * 86400,
				},
			],
		},
		{
			id: 9906,
			hash: 'sha256-fresh-active-wal-lock',
			size: 16 * mib,
			acknowledged: false,
			files: [
				{
					id: 99061,
					path: '/var/db/active/sessions.sqlite-shm',
					size: 16 * mib,
					mtime: refSec - 1 * 86400,
				},
				{
					id: 99062,
					path: '/var/db/mirror/sessions.sqlite-shm',
					size: 16 * mib,
					mtime: refSec - 1 * 86400,
				},
			],
		},
		{
			id: 9907,
			hash: 'sha256-nextcloud-log-recent-2026-11-24',
			size: 32 * mib,
			acknowledged: false,
			files: [
				{
					id: 99071,
					path: '/__groupfolders/14/logs/nextcloud.log.2026-11-24.gz',
					size: 32 * mib,
					mtime: refSec - 1 * 86400,
				},
				{
					id: 99072,
					path: '/archive/logs/nextcloud.log.2026-11-24.gz',
					size: 32 * mib,
					mtime: refSec - 1 * 86400,
				},
			],
		},
		{
			id: 9908,
			hash: 'sha256-nextcloud-log-expired-2026-08-01',
			size: 48 * mib,
			acknowledged: false,
			files: [
				{
					id: 99081,
					path: '/__groupfolders/14/logs/nextcloud.log.2026-08-01.gz',
					size: 48 * mib,
					mtime: refSec - 115 * 86400,
				},
				{
					id: 99082,
					path: '/archive/logs/nextcloud.log.2026-08-01.gz',
					size: 48 * mib,
					mtime: refSec - 115 * 86400,
				},
			],
		},
		{
			id: 9909,
			hash: 'sha256-nextcloud-log-mid-2026-11-20',
			size: 28 * mib,
			acknowledged: false,
			files: [
				{
					id: 99091,
					path: '/logs/nextcloud/nextcloud.log.2026-11-20.gz',
					size: 28 * mib,
					mtime: refSec - 5 * 86400,
				},
				{
					id: 99092,
					path: '/archive/logs/nextcloud.log.2026-11-20.gz',
					size: 28 * mib,
					mtime: refSec - 5 * 86400,
				},
			],
		},
		{
			id: 9910,
			hash: 'sha256-nextcloud-log-mid-2026-11-12',
			size: 28 * mib,
			acknowledged: false,
			files: [
				{
					id: 99101,
					path: '/logs/nextcloud/nextcloud.log.2026-11-12.gz',
					size: 28 * mib,
					mtime: refSec - 12 * 86400,
				},
				{
					id: 99102,
					path: '/archive/logs/nextcloud.log.2026-11-12.gz',
					size: 28 * mib,
					mtime: refSec - 12 * 86400,
				},
			],
		},
	]
}

describe('Cycle 175: Database Dump, Backup Snapshot & Log Rotation Vault Auditor', () => {
	test('classifies all 4 database dump and log rotation families accurately and ignores unrelated files', () => {
		const mod = loadDatabaseDumpLogModule()

		for (const p of [
			'/backups/db_2026-11-24.sql.zst',
			'/backups/db_2026-11-24.sql.gz',
			'/backups/erp_2026-11-24.dump.zst',
			'/backups/analytics.pgdump',
			'/backups/legacy.bak.gz',
			'/backups/cold.archive.gz',
			'/backups/db_2026-11-24.sql.zst.sha256',
			'/backups/analytics.pgdump.sig',
		]) {
			assert.equal(mod.classifyDatabaseDumpLog(p).family, 'compressed-db-archives', `Expected compressed-db-archives for ${p}`)
		}

		for (const p of [
			'/dumps/nextcloud_2026-11-24.sql',
			'/dumps/crm_2026-11-24.dump',
			'/dumps/legacy.bak',
			'/dumps/events.bson',
		]) {
			assert.equal(mod.classifyDatabaseDumpLog(p).family, 'uncompressed-plain-sql-twins', `Expected uncompressed-plain-sql-twins for ${p}`)
		}

		for (const p of [
			'/db/cache.sqlite-wal',
			'/db/cache.sqlite-shm',
			'/db/data.db-journal',
			'/postgres/pg_wal/0000000100000001000000AB.ready',
			'/mysql/ib_logfile0',
			'/dumps/nightly.dump.part',
			'/dumps/nightly.sql.tmp',
		]) {
			assert.equal(mod.classifyDatabaseDumpLog(p).family, 'wal-journal-and-lock-artifacts', `Expected wal-journal-and-lock-artifacts for ${p}`)
		}

		for (const p of [
			'/var/log/nginx/access.log.1',
			'/var/log/nginx/error.log.2.gz',
			'/var/log/nextcloud/nextcloud.log.2026-11-20.gz',
			'/var/log/workers/worker-queue.log.gz',
		]) {
			assert.equal(mod.classifyDatabaseDumpLog(p).family, 'rotated-service-log-archives', `Expected rotated-service-log-archives for ${p}`)
		}

		assert.equal(mod.classifyDatabaseDumpLog('/alice/files/Photos/alpine.jpg'), null)
		assert.equal(mod.classifyDatabaseDumpLog('/Documents/Contract.pdf'), null)
		assert.equal(mod.classifyDatabaseDumpLog('/alice/files/Thumbs.db'), null)

		const parsedZst = mod.parseDatabaseDumpLogInfo('nextcloud_prod_2026-11-24.sql.zst', '/db-backups/nextcloud_prod_2026-11-24.sql.zst')
		const parsedSql = mod.parseDatabaseDumpLogInfo('nextcloud_prod_2026-11-24.sql', '/Downloads/nextcloud_prod_2026-11-24.sql')
		assert.equal(parsedZst.dbLineageStem, 'nextcloud_prod')
		assert.equal(parsedSql.dbLineageStem, 'nextcloud_prod')
		assert.equal(parsedZst.snapshotDate, '2026-11-24')
		assert.equal(parsedSql.snapshotDate, '2026-11-24')
		assert.equal(parsedZst.twinMatchKey, parsedSql.twinMatchKey)
	})

	test('protects latest GFS anchors and .sha256 sidecars, blocks unverified plain SQL dumps, and executes all 3 strategies', () => {
		const mod = loadDatabaseDumpLogModule()
		const analysis = mod.analyzeDatabaseDumpLogDuplicates(buildSampleDatabaseDumpLogDuplicates(), {
			strategy: 'apply-gfs-dump-and-log-retention',
			keepDaily: 1,
			keepWeekly: 1,
			staleWalDays: 7,
			referenceTimeSec: 1796000000,
		})

		assert.equal(analysis.schema, 'duplicatefinder.database-dump-log-auditor.v1')
		assert.equal(analysis.summary.totalClustersCount, 10)
		assert.equal(analysis.summary.familyCounts['compressed-db-archives'], 2)
		assert.equal(analysis.summary.familyCounts['uncompressed-plain-sql-twins'], 2)
		assert.equal(analysis.summary.familyCounts['wal-journal-and-lock-artifacts'], 2)
		assert.equal(analysis.summary.familyCounts['rotated-service-log-archives'], 4)

		const gfsAnchorCluster = analysis.clusters.find(c => c.primaryGroupId === 9901)
		assert.ok(gfsAnchorCluster)
		assert.equal(gfsAnchorCluster.survivor.fileId, 99011)
		assert.equal(gfsAnchorCluster.members.find(m => m.fileId === 99011).tier, 'gfs-retention-anchor')
		assert.equal(gfsAnchorCluster.members.find(m => m.fileId === 99012).verdict, 'blocked-gfs-retention-anchor')
		assert.equal(gfsAnchorCluster.members.find(m => m.fileId === 99013).verdict, 'consolidate-to-vault-anchor')

		const sidecarCluster = analysis.clusters.find(c => c.primaryGroupId === 9902)
		assert.ok(sidecarCluster)
		assert.equal(sidecarCluster.members.find(m => m.fileId === 99022).verdict, 'blocked-sidecar-integrity')

		const verifiedPlainSql = analysis.clusters.find(c => c.primaryGroupId === 9903)
		assert.ok(verifiedPlainSql)
		assert.equal(verifiedPlainSql.members.find(m => m.fileId === 99032).verdict, 'reclaim-uncompressed-sql-twin')

		const unverifiedPlainDump = analysis.clusters.find(c => c.primaryGroupId === 9904)
		assert.ok(unverifiedPlainDump)
		assert.equal(unverifiedPlainDump.members.find(m => m.fileId === 99042).verdict, 'blocked-unverified-compressed-twin')

		const staleWal = analysis.clusters.find(c => c.primaryGroupId === 9905)
		assert.ok(staleWal)
		assert.equal(staleWal.members.find(m => m.fileId === 99052).verdict, 'reclaim-stale-wal-artifact')
		assert.equal(staleWal.members.find(m => m.fileId === 99053).verdict, 'reclaim-stale-wal-artifact')
		assert.equal(staleWal.members.find(m => m.fileId === 99054).verdict, 'reclaim-stale-wal-artifact')

		const freshWal = analysis.clusters.find(c => c.primaryGroupId === 9906)
		assert.ok(freshWal)
		assert.equal(freshWal.members.find(m => m.fileId === 99062).verdict, 'blocked-active-wal-or-lock')

		const recentLog = analysis.clusters.find(c => c.primaryGroupId === 9907)
		assert.ok(recentLog)
		assert.equal(recentLog.members.find(m => m.fileId === 99072).verdict, 'blocked-gfs-retention-anchor')

		const expiredLog = analysis.clusters.find(c => c.primaryGroupId === 9908)
		assert.ok(expiredLog)
		assert.equal(expiredLog.members.find(m => m.fileId === 99082).verdict, 'reclaim-expired-gfs-log')

		// Excluding conserved .sql.zst archive must block plain SQL pruning
		const excludedZstAnalysis = mod.analyzeDatabaseDumpLogDuplicates(buildSampleDatabaseDumpLogDuplicates(), {
			strategy: 'prune-uncompressed-sql-when-zst-verified',
			referenceTimeSec: 1796000000,
			memberOverrides: {
				99011: 'exclude',
				99012: 'exclude',
			},
		})
		assert.equal(
			excludedZstAnalysis.clusters.find(c => c.primaryGroupId === 9903).members.find(m => m.fileId === 99032).verdict,
			'blocked-unverified-compressed-twin'
		)

		// Strategy: prune-stale-wal-and-tmp-artifacts shields non-WAL items
		const walOnlyAnalysis = mod.analyzeDatabaseDumpLogDuplicates(buildSampleDatabaseDumpLogDuplicates(), {
			strategy: 'prune-stale-wal-and-tmp-artifacts',
			staleWalDays: 7,
			referenceTimeSec: 1796000000,
		})
		assert.equal(
			walOnlyAnalysis.clusters.find(c => c.primaryGroupId === 9903).members.find(m => m.fileId === 99032).verdict,
			'blocked-strategy-scope'
		)
		assert.equal(
			walOnlyAnalysis.clusters.find(c => c.primaryGroupId === 9905).members.find(m => m.fileId === 99052).verdict,
			'reclaim-stale-wal-artifact'
		)
	})

	test('supports operator overrides, DRY_RUN=1 POSIX script, .sync-exclude.lst, CWE-1236 CSV, and JSON manifest', () => {
		const mod = loadDatabaseDumpLogModule()
		const duplicates = [
			...buildSampleDatabaseDumpLogDuplicates(),
			{
				id: 9999,
				hash: 'sha256-formula-sql',
				size: 1024 * 1024 * 5,
				acknowledged: false,
				files: [
					{ id: 99991, path: '/db-backups/=CMD("calc")_2026-11-24.sql.zst', size: 5242880, mtime: 1795900000 },
					{ id: 99992, path: '/Downloads/stray_2026-11-24.sql.zst', size: 5242880, mtime: 1795800000 },
				],
			},
			{
				id: 9998,
				hash: 'sha256-formula-plus-sql',
				size: 4096,
				acknowledged: false,
				files: [
					{ id: 99981, path: '/db-backups/+malicious_2026-11-24.sql.zst', size: 4096, mtime: 1795900000 },
					{ id: 99982, path: '/Downloads/stray_plus_2026-11-24.sql.zst', size: 4096, mtime: 1795800000 },
				],
			},
		]

		const analysis = mod.analyzeDatabaseDumpLogDuplicates(duplicates, {
			strategy: 'apply-gfs-dump-and-log-retention',
			keepDaily: 1,
			keepWeekly: 1,
			staleWalDays: 7,
			referenceTimeSec: 1796000000,
		})

		const script = mod.buildDatabaseDumpLogScript(analysis, { dataRoot: '/srv/nc/data' })
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('sha256sum --'))
		assert.ok(script.includes('stat -c %d'))
		assert.ok(script.includes('stat -f %d'))
		assert.ok(script.includes('consolidate_db_archive'))
		assert.ok(script.includes('prune_verified_db_artifact'))
		assert.ok(script.includes('occ files:scan --path='))

		const overrideAnalysis = mod.analyzeDatabaseDumpLogDuplicates(buildSampleDatabaseDumpLogDuplicates(), {
			strategy: 'prune-stale-wal-and-tmp-artifacts',
			staleWalDays: 7,
			memberOverrides: {
				99052: 'force-keep',
				99053: 'exclude',
			},
			referenceTimeSec: 1796000000,
		})
		const overridden = overrideAnalysis.clusters.find(c => c.primaryGroupId === 9905)
		assert.equal(overridden.members.find(m => m.fileId === 99052).verdict, 'blocked-manual-shield')
		assert.equal(overridden.members.find(m => m.fileId === 99053).verdict, 'excluded')

		const syncExclude = mod.buildDatabaseDumpLogSyncExcludeSnippet(analysis)
		for (const pattern of ['*.sqlite-wal', '*.sqlite-shm', '*.db-journal', 'pg_wal/', 'ib_logfile*', '*.dump.part', '*.sql.tmp', 'nextcloud.log.*', 'worker-*.log.gz']) {
			assert.ok(syncExclude.includes(pattern), `Expected .sync-exclude.lst pattern ${pattern}`)
		}

		const csv = mod.buildDatabaseDumpLogCsvReport(analysis)
		assert.ok(csv.includes('"\'=CMD(""calc"")_2026-11-24.sql.zst"') || csv.includes("'=CMD"))
		assert.ok(csv.includes("'+malicious_2026-11-24.sql.zst"))

		const json = JSON.parse(mod.buildDatabaseDumpLogJsonReport(analysis, '2026-11-24T08:15:00Z'))
		assert.equal(json.schema, 'duplicatefinder.database-dump-log-auditor.v1')
		assert.equal(json.generatedAt, '2026-11-24T08:15:00Z')
		assert.ok(Array.isArray(json.clusters))
	})

	test('renders DatabaseDumpLogWorkbench empty, filter-empty, populated, and interactive states without clamping numeric inputs', async () => {
		let copied = ''
		const Workbench = loadDatabaseDumpLogWorkbench({
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
		assert.ok(emptyVm.$el.querySelector('.ddl__empty-banner'))
		emptyVm.$destroy()

		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: buildSampleDatabaseDumpLogDuplicates(),
					allDuplicates: buildSampleDatabaseDumpLogDuplicates(),
					currentDuplicateId: 9901,
				},
			}),
		}).$mount()
		await settle()

		assert.equal(vm.$el.querySelectorAll('.ddl__cluster-item').length, 10)
		assert.ok(vm.$el.textContent.includes('nextcloud_prod_2026-11-24.sql.zst'))

		const numInputs = vm.$el.querySelectorAll('.ddl__num-input')
		assert.equal(numInputs.length, 4)
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
		assert.ok(vm.$el.querySelector('.ddl__notice.is-success'))

		const searchInput = vm.$el.querySelector('input[type="search"]')
		searchInput.value = 'no-such-db-dump-xyz'
		searchInput.dispatchEvent(new window.Event('input'))
		await settle()
		assert.ok(vm.$el.querySelector('.ddl__empty-banner'))

		const resetBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Reset Filters'))
		resetBtn.click()
		await settle()
		assert.equal(vm.$el.querySelectorAll('.ddl__cluster-item').length, 10)

		vm.$destroy()
	})

	test('integrates DB & Log Vault button and Shift+Q keyboard shortcut in App.vue', async () => {
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
		const DatabaseDumpLogWorkbench = loadDatabaseDumpLogWorkbench({ writeText: async () => {} })

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
			'./components/VmContainerImageWorkbench.vue': { __esModule: true, default: stub('vm-container-image-auditor') },
			'./components/MlDatasetArtifactWorkbench.vue': { __esModule: true, default: stub('ml-dataset-artifact-auditor') },
			'./components/Game3dAssetVaultWorkbench.vue': { __esModule: true, default: stub('game3d-asset-vault-auditor') },
			'./components/DatabaseDumpLogWorkbench.vue': { __esModule: true, default: DatabaseDumpLogWorkbench },
			'./components/DesignPublishingVaultWorkbench.vue': { __esModule: true, default: stub('design-publishing-vault-auditor') },
			'./components/ReleaseBinaryArtifactWorkbench.vue': { __esModule: true, default: stub('release-binary-artifact-auditor') },
			'./components/EmailArchiveVaultWorkbench.vue': { __esModule: true, default: stub('email-archive-vault-auditor') },
			'./components/AudioDawVaultWorkbench.vue': { __esModule: true, default: stub('audio-daw-vault-auditor') },
			'./components/GisMapArchiveWorkbench.vue': { __esModule: true, default: stub('gis-map-archive-auditor') },
			'./components/ScientificResearchVaultWorkbench.vue': { __esModule: true, default: stub('scientific-research-vault-auditor') },
			'./components/LegalContractVaultWorkbench.vue': { __esModule: true, default: stub('legal-contract-vault-auditor') },
			'./components/MedicalDicomVaultWorkbench.vue': { __esModule: true, default: stub('medical-dicom-vault-auditor') },
			'./components/AdditiveManufacturingVaultWorkbench.vue': { __esModule: true, default: stub('additive-mfg-vault-auditor') },
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
					entities: status === 'acknowledged' ? [] : buildSampleDatabaseDumpLogDuplicates(),
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

		const topbarBtn = vm.$el.querySelector('.topbar-database-dump-log-button')
		assert.ok(topbarBtn, 'Topbar DB & Log Vault button must exist')

		const action = keyboardShortcuts.resolveShortcutAction({ key: 'Q', shiftKey: true, target: vm.$el })
		assert.equal(action, 'toggle-database-dump-log-auditor')
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'q', shiftKey: false, target: vm.$el }), 'toggle-recovery-safety')

		topbarBtn.click()
		await settle()
		assert.ok(vm.$el.querySelector('.database-dump-log-workbench'), 'DatabaseDumpLogWorkbench must mount on click')

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Q', shiftKey: true, bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.database-dump-log-workbench'), null, 'DatabaseDumpLogWorkbench must toggle closed on Shift+Q shortcut')

		vm.$destroy()
	})

	test('keeps zero U+2013/U+2014 typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/databaseDumpLogAuditor.js',
			'src/components/DatabaseDumpLogWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.equal(content.includes('\u2013'), false, `Unexpected U+2013 in ${relPath}`)
			assert.equal(content.includes('\u2014'), false, `Unexpected U+2014 in ${relPath}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `Unexpected XSS sink in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/DatabaseDumpLogWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes('min-block-size: 44px'))
		assert.ok(vueContent.includes(':focus-visible'))
	})
})
