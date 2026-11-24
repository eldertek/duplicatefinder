const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

/**
 * Load the pure Mobile App Build, iOS/Android Artifacts & Crash Symbol Vault auditor module.
 *
 * @return {object} Loaded module exports.
 */
function loadMobileBuildVaultModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateStats': duplicateStats,
	})
	return loadModule('src/tools/mobileBuildVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

/**
 * Load MobileBuildVaultWorkbench Vue component with mocked clipboard helper.
 *
 * @param {Array<string>} [copiedPayloads] Array collecting copied strings.
 * @return {object} Loaded Vue component definition.
 */
function loadMobileBuildVaultWorkbench(copiedPayloads = []) {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateStats': duplicateStats,
	})
	const mobileBuildVaultAuditor = loadModule('src/tools/mobileBuildVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return loadComponent('src/components/MobileBuildVaultWorkbench.vue', {
		'../tools/clipboardHelper': {
			copyTextSafely: async (text) => {
				copiedPayloads.push(text)
				return true
			},
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/mobileBuildVaultAuditor': mobileBuildVaultAuditor,
	})
}

/**
 * Build deterministic Mobile App Build, iOS/Android & Crash Symbol Vault duplicate groups.
 *
 * @param {number} [nowMs] Reference epoch milliseconds.
 * @return {Array<object>} Sample duplicate groups.
 */
function buildSampleMobileBuildDuplicates(nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)) {
	const twoDaysAgo = Math.floor((nowMs - 2 * 24 * 60 * 60 * 1000) / 1000)
	const thirtyDaysAgo = Math.floor((nowMs - 30 * 24 * 60 * 60 * 1000) / 1000)

	return [
		{
			id: 1941,
			hash: 'hash-ios-appstore-ipa',
			acknowledged: false,
			files: [
				{
					id: 19411,
					path: '/Mobile_Vault/AppStore_Signed/FinWallet_v2.4.0_prod_signed.ipa',
					size: 84 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19412,
					path: '/CI_Artifacts/TestFlight/FinWallet_v2.4.0_beta_rc1.ipa',
					size: 84 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
				{
					id: 19413,
					path: '/Projects/FinWallet/ios/build/FinWallet_v2.4.0_unsigned.ipa',
					size: 84 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1942,
			hash: 'hash-android-playstore-aab-apk',
			acknowledged: false,
			files: [
				{
					id: 19421,
					path: '/Mobile_Vault/PlayStore_Releases/FinWallet_v2.4.0_playstore_signed.aab',
					size: 62 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19422,
					path: '/CI_Builds/Nightly/FinWallet_v2.4.0_nightly.aab',
					size: 62 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
				{
					id: 19423,
					path: '/Projects/FinWallet/android/app/build/outputs/bundle/release/FinWallet_v2.4.0.aab',
					size: 62 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1943,
			hash: 'hash-ios-xcarchive',
			acknowledged: false,
			files: [
				{
					id: 19431,
					path: '/Mobile_Vault/AppStore_Signed/FinWallet_v2.4.0_release.xcarchive.zip',
					size: 220 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19432,
					path: '/CI_Artifacts/Staging/FinWallet_v2.4.0_staging.xcarchive.zip',
					size: 220 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1944,
			hash: 'hash-crash-dsym-proguard',
			acknowledged: false,
			files: [
				{
					id: 19441,
					path: '/Crash_Symbol_Vault/AppStore/FinWallet_v2.4.0_prod.dSYM.zip',
					size: 48 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19442,
					path: '/CI_Artifacts/Debug_Builds/FinWallet_v2.4.0_debug.dSYM.zip',
					size: 48 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1945,
			hash: 'hash-proguard-mapping-txt',
			acknowledged: false,
			files: [
				{
					id: 19451,
					path: '/Crash_Symbol_Vault/PlayStore/v2.4.0/proguard/mapping.txt',
					size: 6 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19452,
					path: '/Projects/FinWallet/android/app/build/outputs/mapping/release/mapping.txt',
					size: 6 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1946,
			hash: 'hash-signing-keystores',
			acknowledged: false,
			files: [
				{
					id: 19461,
					path: '/Signing_Vault/Android/upload-keystore.jks',
					size: 16 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19462,
					path: '/Downloads/Backup_Keys/upload-keystore_copy1.jks',
					size: 16 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1947,
			hash: 'hash-ios-p12-mobileprovision',
			acknowledged: false,
			files: [
				{
					id: 19471,
					path: '/Signing_Vault/Apple/FinWallet_Distribution.p12',
					size: 8 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19472,
					path: '/Signing_Vault/Apple/FinWallet_AppStore.mobileprovision',
					size: 12 * 1024,
					mtime: thirtyDaysAgo,
				},
			],
		},
		{
			id: 1948,
			hash: 'hash-regenerable-deriveddata-gradle-pods',
			acknowledged: false,
			files: [
				{
					id: 19481,
					path: '/Users/dev/Library/Developer/Xcode/DerivedData/FinWallet-abc/Build/Intermediates.noindex/FinWallet.build/FinWallet.swiftmodule',
					size: 32 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
				{
					id: 19482,
					path: '/Users/dev/Library/Developer/Xcode/DerivedData/FinWallet-def/Build/Intermediates.noindex/FinWallet.build/FinWallet.swiftmodule',
					size: 32 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1949,
			hash: 'hash-gradle-pods-cache',
			acknowledged: false,
			files: [
				{
					id: 19491,
					path: '/Projects/FinWallet/android/.gradle/caches/modules-2/files-2.1/firebase-crashlytics.aar',
					size: 18 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
				{
					id: 19492,
					path: '/Projects/FinWallet-branch/ios/Pods/FirebaseCrashlytics/Crashlytics.xcframework',
					size: 18 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
		{
			id: 1940,
			hash: 'hash-unrelated-video',
			acknowledged: false,
			files: [
				{
					id: 19401,
					path: '/Videos/Family/holiday_clip.mp4',
					size: 120 * 1024 * 1024,
					mtime: thirtyDaysAgo,
				},
				{
					id: 19402,
					path: '/Backups/holiday_clip.mp4',
					size: 120 * 1024 * 1024,
					mtime: twoDaysAgo,
				},
			],
		},
	]
}

describe('Cycle 194: Mobile App Build, iOS/Android Artifacts & Crash Symbol Vault Auditor', () => {
	test('classifies all 4 mobile build families and rejects unrelated files', () => {
		const mod = loadMobileBuildVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)

		const ipaStore = mod.classifyMobileBuildFile({ path: '/Mobile_Vault/AppStore_Signed/MyApp_v3.1.0_prod_signed.ipa', size: 1000 }, nowMs)
		assert.equal(ipaStore.family, 'mobile-app-packages')
		assert.equal(ipaStore.mobilePlatform, 'iOS')
		assert.equal(ipaStore.buildVersion, 'v3.1.0')
		assert.equal(ipaStore.isSignedStoreRelease, true)

		const aabPlay = mod.classifyMobileBuildFile({ path: '/PlayStore_Releases/MyApp_v3.1.0_release.aab', size: 1000 }, nowMs)
		assert.equal(aabPlay.family, 'mobile-app-packages')
		assert.equal(aabPlay.mobilePlatform, 'Android')
		assert.equal(aabPlay.isSignedStoreRelease, true)

		const apkDebug = mod.classifyMobileBuildFile({ path: '/Projects/App/android/app/build/outputs/apk/debug/app-debug.apk', size: 1000 }, nowMs)
		assert.equal(apkDebug.family, 'mobile-app-packages')
		assert.equal(apkDebug.isSignedStoreRelease, false)
		assert.equal(apkDebug.isRegenerableBuildCache, true)

		const dsymProd = mod.classifyMobileBuildFile({ path: '/Crash_Symbol_Vault/AppStore/MyApp_v3.1.0_prod.dSYM.zip', size: 1000 }, nowMs)
		assert.equal(dsymProd.family, 'crash-debug-symbols')
		assert.equal(dsymProd.isProdSymbolVault, true)

		const mappingProd = mod.classifyMobileBuildFile({ path: '/Symbol_Vault/PlayStore/v3.1.0/proguard/mapping.txt', size: 1000 }, nowMs)
		assert.equal(mappingProd.family, 'crash-debug-symbols')
		assert.equal(mappingProd.isProdSymbolVault, true)

		const jksKeystore = mod.classifyMobileBuildFile({ path: '/Signing_Vault/release-upload.jks', size: 1000 }, nowMs)
		assert.equal(jksKeystore.family, 'signing-keystores-certs')
		assert.equal(jksKeystore.isSigningKeystore, true)

		const p12Cert = mod.classifyMobileBuildFile({ path: '/Signing_Vault/Apple/Dist.p12', size: 1000 }, nowMs)
		assert.equal(p12Cert.family, 'signing-keystores-certs')
		assert.equal(p12Cert.isSigningKeystore, true)

		const mobileProvision = mod.classifyMobileBuildFile({ path: '/Signing_Vault/Apple/AppStore.mobileprovision', size: 1000 }, nowMs)
		assert.equal(mobileProvision.family, 'signing-keystores-certs')
		assert.equal(mobileProvision.isSigningKeystore, true)

		const p8Key = mod.classifyMobileBuildFile({ path: '/Signing_Vault/Apple/AuthKey_9X8Y7Z.p8', size: 1000 }, nowMs)
		assert.equal(p8Key.family, 'signing-keystores-certs')
		assert.equal(p8Key.isSigningKeystore, true)

		const derivedData = mod.classifyMobileBuildFile({ path: '/Xcode/DerivedData/MyApp/Build/Intermediates.noindex/MyApp.o', size: 1000 }, nowMs)
		assert.equal(derivedData.family, 'regenerable-build-caches')
		assert.equal(derivedData.isRegenerableBuildCache, true)

		const gradleCache = mod.classifyMobileBuildFile({ path: '/Projects/MyApp/.gradle/caches/modules-2/lib.aar', size: 1000 }, nowMs)
		assert.equal(gradleCache.family, 'regenerable-build-caches')
		assert.equal(gradleCache.isRegenerableBuildCache, true)

		const podsCache = mod.classifyMobileBuildFile({ path: '/Projects/MyApp/ios/Pods/Alamofire/Alamofire.podspec', size: 1000 }, nowMs)
		assert.equal(podsCache.family, 'regenerable-build-caches')
		assert.equal(podsCache.isRegenerableBuildCache, true)

		const unrelated = mod.classifyMobileBuildFile({ path: '/Documents/Finance/Q4_ledger.xlsx', size: 1000 }, nowMs)
		assert.equal(unrelated.family, null)
	})

	test('strictly conserves signed store releases, prod dSYM/ProGuard symbols, and signing keystores while reclaiming beta/CI builds and caches', () => {
		const mod = loadMobileBuildVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleMobileBuildDuplicates(nowMs)
		const report = mod.auditMobileBuildVault(groups, {}, nowMs)

		assert.equal(report.schema, mod.MOBILE_BUILD_VAULT_SCHEMA)
		assert.equal(report.summary.totalClustersCount, 9)
		assert.equal(report.familyCounts['mobile-app-packages'], 3)
		assert.equal(report.familyCounts['crash-debug-symbols'], 2)
		assert.equal(report.familyCounts['signing-keystores-certs'], 2)
		assert.equal(report.familyCounts['regenerable-build-caches'], 2)

		const ipaCluster = report.clusters.find(c => c.id === 1941)
		assert.ok(ipaCluster)
		assert.equal(ipaCluster.clusterVerdict, 'signed-store-release-protected')
		const storeMember = ipaCluster.members.find(m => m.id === 19411)
		const betaMember = ipaCluster.members.find(m => m.id === 19412)
		const cacheMember = ipaCluster.members.find(m => m.id === 19413)
		assert.equal(storeMember.shielded, true)
		assert.equal(storeMember.action, 'keep')
		assert.equal(betaMember.action, 'delete')
		assert.equal(cacheMember.action, 'delete')

		const mappingCluster = report.clusters.find(c => c.id === 1945)
		assert.ok(mappingCluster)
		assert.equal(mappingCluster.clusterVerdict, 'prod-symbol-vault-protected')
		assert.equal(mappingCluster.members.find(m => m.id === 19451).shielded, true)
		assert.equal(mappingCluster.members.find(m => m.id === 19452).action, 'delete')

		const keystoreCluster = report.clusters.find(c => c.id === 1946)
		assert.ok(keystoreCluster)
		assert.equal(keystoreCluster.clusterVerdict, 'signing-keystore-protected')
		assert.equal(keystoreCluster.reclaimableBytes, 0)
		assert.equal(keystoreCluster.members.every(m => m.shielded && m.action === 'keep'), true)

		const p12Cluster = report.clusters.find(c => c.id === 1947)
		assert.ok(p12Cluster)
		assert.equal(p12Cluster.reclaimableBytes, 0)
		assert.equal(p12Cluster.members.every(m => m.shielded && m.action === 'keep'), true)
	})

	test('blocks beta/CI deletion without verified release anchor when requireVerifiedReleaseAnchor is ON, and never hardlinks keystores, mapping.txt, or caches', () => {
		const mod = loadMobileBuildVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const orphanBetaGroup = [
			{
				id: 9901,
				hash: 'hash-orphan-beta',
				files: [
					{ id: 99011, path: '/CI_Artifacts/TestFlight/OrphanApp_v1.0.0_beta.ipa', size: 10 * 1024 * 1024, mtime: Math.floor((nowMs - 86400000) / 1000) },
					{ id: 99012, path: '/CI_Artifacts/Staging/OrphanApp_v1.0.0_staging.ipa', size: 10 * 1024 * 1024, mtime: Math.floor((nowMs - 86400000) / 1000) },
				],
			},
		]

		const strictReport = mod.auditMobileBuildVault(orphanBetaGroup, { requireVerifiedReleaseAnchor: true }, nowMs)
		assert.equal(strictReport.clusters[0].reclaimableBytes, 0)
		assert.equal(strictReport.clusters[0].members.every(m => m.shielded), true)

		const unlockedReport = mod.auditMobileBuildVault(orphanBetaGroup, {
			requireVerifiedReleaseAnchor: false,
			strategy: 'hardlink-immutable-artifacts',
		}, nowMs)
		assert.equal(unlockedReport.clusters[0].hardlinkTargetsCount, 1)

		const fullHardlinkReport = mod.auditMobileBuildVault(buildSampleMobileBuildDuplicates(nowMs), {
			strategy: 'hardlink-immutable-artifacts',
		}, nowMs)
		const mappingCluster = fullHardlinkReport.clusters.find(c => c.id === 1945)
		assert.equal(mappingCluster.members.find(m => m.id === 19452).action, 'delete')
		const keystoreCluster = fullHardlinkReport.clusters.find(c => c.id === 1946)
		assert.equal(keystoreCluster.members.every(m => m.action === 'keep'), true)
	})

	test('generates safe DRY_RUN=1 script, CWE-1236 CSV, JSON manifest, and .sync-exclude.lst rules', () => {
		const mod = loadMobileBuildVaultModule()
		const nowMs = Date.UTC(2026, 10, 24, 12, 0, 0)
		const groups = buildSampleMobileBuildDuplicates(nowMs)
		groups[0].files[1].path = '=SUM(1+1)_beta.ipa'

		const report = mod.auditMobileBuildVault(groups, {}, nowMs)
		const script = mod.buildMobileBuildRemediationScript(report)
		assert.match(script, /DRY_RUN="\$\{DRY_RUN:-1\}"/)
		assert.match(script, /rm -f/)
		assert.equal(script.includes('upload-keystore.jks'), false)
		assert.equal(/run_cmd\s+[^\n]*FinWallet_v2\.4\.0_prod_signed\.ipa/.test(script), false)

		const quarantineReport = mod.auditMobileBuildVault(groups, { strategy: 'quarantine-beta-and-caches' }, nowMs)
		const quarantineScript = mod.buildMobileBuildRemediationScript(quarantineReport)
		assert.match(quarantineScript, /mv -n/)

		const csv = mod.buildMobileBuildCsvReport(report)
		assert.ok(csv.includes('\r\n'))
		assert.match(csv, /'=SUM\(1\+1\)/)
		assert.equal(csv.includes(',=SUM('), false)

		const manifest = JSON.parse(mod.buildMobileBuildJsonManifest(report))
		assert.equal(manifest.schema, mod.MOBILE_BUILD_VAULT_SCHEMA)
		assert.equal(manifest.clusters.length, 9)

		const syncExclude = mod.buildMobileBuildSyncExcludeList()
		assert.ok(syncExclude.includes('DerivedData/'))
		assert.ok(syncExclude.includes('.gradle/'))
		assert.ok(syncExclude.includes('Pods/'))
		assert.ok(syncExclude.includes('android/app/build/'))
		assert.ok(syncExclude.includes('ios/build/'))
	})

	test('MobileBuildVaultWorkbench renders empty state and full audit interactions cleanly', async () => {
		const copied = []
		const Workbench = loadMobileBuildVaultWorkbench(copied)

		const emptyNode = document.createElement('div')
		document.body.appendChild(emptyNode)
		const emptyVm = new Vue({
			render: h => h(Workbench, {
				props: { duplicates: [], allDuplicates: [] },
			}),
		}).$mount(emptyNode)

		try {
			await settle()
			assert.ok(emptyVm.$el.querySelector('.mbv__empty-banner'))
		} finally {
			emptyVm.$destroy()
			emptyNode.remove()
		}

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const events = []
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: buildSampleMobileBuildDuplicates(),
					allDuplicates: buildSampleMobileBuildDuplicates(),
				},
				on: {
					'select-duplicate': d => events.push(['select', d.id]),
					'compare-duplicate': d => events.push(['compare', d.id]),
				},
			}),
		}).$mount(mountNode)

		try {
			await settle()
			const cards = vm.$el.querySelectorAll('.mbv__cluster-card')
			assert.equal(cards.length, 9)

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
			assert.ok(copied[1].includes('DerivedData/'))

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

	test('App.vue renders Mobile & Crash Vault button and toggles MobileBuildVaultWorkbench via Shift+F3 shortcut', async () => {
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

		const MobileBuildVaultWorkbench = loadMobileBuildVaultWorkbench()

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
			'./components/MobileBuildVaultWorkbench.vue': { __esModule: true, default: MobileBuildVaultWorkbench },
			'./components/K8sTerraformVaultWorkbench.vue': { __esModule: true, default: stub('k8s-terraform-vault-auditor') },
			'./components/PublishingPrepressVaultWorkbench.vue': { __esModule: true, default: stub('publishing-prepress-vault-auditor') },
			'./components/GenomicsBioinformaticsVaultWorkbench.vue': { __esModule: true, default: stub('genomics-bioinformatics-vault-auditor') },
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
					entities: type === 'unacknowledged' ? buildSampleMobileBuildDuplicates() : [],
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

			const btn = vm.$el.querySelector('button.topbar-mobile-build-vault-button')
			assert.ok(btn, 'Mobile & Crash Vault button is rendered in topbar')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Shift+F3')
			assert.equal(vm.$el.querySelector('.mobile-build-vault-workbench'), null)

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F3', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.ok(vm.$el.querySelector('.mobile-build-vault-workbench'), 'MobileBuildVaultWorkbench must open on Shift+F3 shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F3', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.$el.querySelector('.mobile-build-vault-workbench'), null, 'MobileBuildVaultWorkbench must toggle closed on Shift+F3 shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Mobile App Build, iOS/Android Artifacts & Crash Symbol Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/mobileBuildVaultAuditor.js',
			'src/components/MobileBuildVaultWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `No U+2013/U+2014 in ${rel}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `No XSS sink in ${rel}`)
		}
	})
})
