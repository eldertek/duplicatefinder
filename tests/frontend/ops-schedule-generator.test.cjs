const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadOpsModules() {
	const duplicateStats = loadModule('src/tools/duplicateStats.js', {})
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js', {})
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {})
	const opsScheduleGenerator = loadModule('src/tools/opsScheduleGenerator.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return {
		duplicateStats,
		duplicatePathDiff,
		duplicateSelectionAndExport,
		opsScheduleGenerator,
	}
}

function loadOpsWorkbench() {
	const { opsScheduleGenerator } = loadOpsModules()
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js', {})
	return loadComponent('src/components/OpsScheduleWorkbench.vue', {
		'../tools/clipboardHelper': clipboardHelper,
		'../tools/opsScheduleGenerator': opsScheduleGenerator,
	})
}

function buildSampleOpsDuplicates() {
	return [
		{
			id: 501,
			hash: 'ops-vm-01',
			size: 2 * 1024 * 1024 * 1024,
			files: [
				{
					id: 5001,
					path: '/alice/files/VMs/app-node-backup.qcow2',
					size: 2 * 1024 * 1024 * 1024,
					mtime: 1732000000000,
				},
				{
					id: 5002,
					path: '/alice/files/Archive/app-node-backup-copy.qcow2',
					size: 2 * 1024 * 1024 * 1024,
					mtime: 1732050000000,
				},
			],
		},
		{
			id: 502,
			hash: 'ops-gf-02',
			size: 512 * 1024 * 1024,
			files: [
				{
					id: 5003,
					path: '/__groupfolders/14/Releases/build-2026.tar.zst',
					size: 512 * 1024 * 1024,
					mtime: 1732100000000,
				},
				{
					id: 5004,
					path: '/bob/files/Mirror/build-2026.tar.zst',
					size: 512 * 1024 * 1024,
					mtime: 1732150000000,
				},
			],
		},
		{
			id: 503,
			hash: 'ops-ext-03',
			size: 256 * 1024 * 1024,
			files: [
				{
					id: 5005,
					path: '/External/nas_media/raw/clip-001.mov',
					size: 256 * 1024 * 1024,
					mtime: 1732200000000,
				},
				{
					id: 5006,
					path: '/External/nas_media/edit/clip-001.mov',
					size: 256 * 1024 * 1024,
					mtime: 1732250000000,
				},
			],
		},
	]
}

test('OpsScheduleGenerator pure engine and OpsScheduleWorkbench.vue', async t => {
	await t.test('sanitizes POSIX paths, systemd unit slugs, cron expressions, and OnCalendar strings', () => {
		const { opsScheduleGenerator } = loadOpsModules()
		const {
			sanitizeServiceName,
			sanitizePosixPath,
			sanitizePosixUser,
			sanitizeCronExpr,
			sanitizeOnCalendar,
			deriveScheduleExpressions,
			extractUserScope,
		} = opsScheduleGenerator

		assert.equal(sanitizeServiceName('Nextcloud_Dup! $(rm -rf /)'), 'nextcloud_dup-rm--rf')
		assert.equal(sanitizeServiceName('   '), 'nextcloud-duplicatefinder')
		assert.equal(sanitizePosixPath('/var/www/nextcloud; rm -rf /', '/fallback'), '/var/www/nextcloudrm-rf/')
		assert.equal(sanitizePosixPath('relative/path', '/fallback'), '/fallback')
		assert.equal(sanitizePosixUser('www-data;id'), 'www-dataid')
		assert.equal(sanitizeCronExpr('15 2 * * *'), '15 2 * * *')
		assert.equal(sanitizeCronExpr('bad cron', '0 3 * * 0'), '0 3 * * 0')
		assert.equal(sanitizeOnCalendar('Mon..Fri *-*-* 02:15:00'), 'Mon..Fri *-*-* 02:15:00')
		assert.equal(sanitizeOnCalendar('Mon..Fri *-*-* 02:15:00\nExecStart=/bin/sh'), '*-*-* 02:15:00')

		const weekly = deriveScheduleExpressions({ frequency: 'weekly', runTime: '03:45' })
		assert.equal(weekly.cronExpression, '45 3 * * 0')
		assert.equal(weekly.systemdOnCalendar, 'Sun *-*-* 03:45:00')
		assert.equal(weekly.runsPerWeek, 1)

		const gfScope = extractUserScope('/__groupfolders/14/Releases/file.zip')
		assert.equal(gfScope.laneType, 'group_folder')
		assert.equal(gfScope.occScopeFlag, '--path="/__groupfolders/14"')

		const userScope = extractUserScope('/alice/files/Docs/spec.pdf')
		assert.equal(userScope.laneType, 'user_home')
		assert.equal(userScope.occScopeFlag, '--user="alice"')

		const extScope = extractUserScope('/External/nas_media/raw/clip.mov')
		assert.equal(extScope.laneType, 'external_mount')
		assert.equal(extScope.occScopeFlag, '--path="/External/nas_media"')
	})

	await t.test('computes sharded lanes, SLA cycles, and preflight health blocks/warnings deterministically', () => {
		const { opsScheduleGenerator } = loadOpsModules()
		const {
			buildOpsSchedulePlan,
			buildSystemdServiceUnit,
			buildSystemdTimerUnit,
			buildCronAndRunnerScript,
			buildInstallBundleScript,
			buildOpsScheduleAuditCsv,
			buildOpsScheduleAuditJson,
		} = opsScheduleGenerator

		const sample = buildSampleOpsDuplicates()
		const healthyPlan = buildOpsSchedulePlan(sample, {
			storageTier: 'ssd',
			ioClass: 'best-effort-7',
			memoryHighMb: 512,
			memoryMaxMb: 1024,
			cpuQuotaPct: 35,
			useFlock: true,
			slaTargetPct: 80,
			maxGroupsPerRun: 2,
			windowMinutes: 120,
		})

		assert.equal(healthyPlan.summary.totalGroups, 3)
		assert.equal(healthyPlan.summary.totalFiles, 6)
		assert.equal(healthyPlan.allLanes.length, 4)
		assert.equal(healthyPlan.summary.preflightBlockCount, 0)
		assert.ok(healthyPlan.summary.slaTargetBytes > 0)
		assert.ok(healthyPlan.summary.cyclesToReachSla >= 1)

		const serviceUnit = buildSystemdServiceUnit(healthyPlan)
		assert.ok(serviceUnit.includes('MemoryHigh=512M'))
		assert.ok(serviceUnit.includes('MemoryMax=1024M'))
		assert.ok(serviceUnit.includes('CPUQuota=35%'))
		assert.ok(serviceUnit.includes('IOSchedulingClass=best-effort'))
		assert.ok(serviceUnit.includes('IOSchedulingPriority=7'))
		assert.ok(serviceUnit.includes('/usr/bin/flock -n /run/lock/nextcloud-duplicatefinder.lock'))

		const timerUnit = buildSystemdTimerUnit(healthyPlan)
		assert.ok(timerUnit.includes('OnCalendar=*-*-* 02:15:00'))
		assert.ok(timerUnit.includes('Persistent=true'))
		assert.ok(timerUnit.includes('RandomizedDelaySec=10m'))

		const { cronLine, runnerScript } = buildCronAndRunnerScript(healthyPlan)
		assert.ok(cronLine.includes('15 2 * * * www-data /usr/bin/flock -n'))
		assert.ok(cronLine.includes('/usr/bin/ionice -c2 -n7 /usr/bin/nice -n 15'))
		assert.ok(runnerScript.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(runnerScript.includes('duplicates:find-all'))
		assert.ok(runnerScript.includes('duplicates:list-all --output=json'))
		assert.ok(runnerScript.includes('status --output=json'))

		const installBundle = buildInstallBundleScript(healthyPlan)
		assert.ok(installBundle.includes('systemd-analyze verify'))
		assert.ok(installBundle.includes('systemctl enable --now'))

		// Unsafe config triggers blocker checks
		const unsafePlan = buildOpsSchedulePlan(sample, {
			useFlock: false,
			memoryHighMb: 1024,
			memoryMaxMb: 512,
			storageTier: 'network_nfs_smb',
			ioClass: 'idle-3',
			minFreeDiskPct: 5,
			requireMaintenanceOff: false,
		})
		assert.equal(unsafePlan.summary.preflightBlockCount, 2)
		assert.ok(unsafePlan.summary.preflightWarnCount >= 3)

		// CWE-1236 CSV formula escaping
		const csvSample = [
			{
				id: 901,
				hash: 'cwe-1236',
				size: 1024 * 1024,
				files: [
					{ id: 9001, path: '/=CMD|calc/files/a.bin', size: 1024 * 1024 },
					{ id: 9002, path: '/+SUM(1,2)/files/b.bin', size: 1024 * 1024 },
				],
			},
		]
		const csvPlan = buildOpsSchedulePlan(csvSample)
		const csv = buildOpsScheduleAuditCsv(csvPlan)
		assert.equal(csv.includes('=CMD'), false)
		assert.equal(csv.includes('+SUM'), false)
		const formulaCsv = buildOpsScheduleAuditCsv({
			lanes: [
				{
					laneId: 'user:formula',
					laneType: 'user_home',
					laneLabel: '=SUM(1,2)',
					groupCount: 1,
					fileCount: 2,
					reclaimableBytes: 1024,
					reclaimableFormatted: '1 KB',
					wasteSharePct: 100,
					estimatedScanSec: 2,
					estimatedScanFormatted: '2s',
					exceedsWindow: false,
					recommendedMinSize: '0',
					recommendedCommand: '+CMD|calc',
				},
			],
		})
		assert.ok(formulaCsv.includes("'=SUM(1,2)"))
		assert.ok(formulaCsv.includes("'+CMD|calc"))
		const jsonAudit = buildOpsScheduleAuditJson(healthyPlan)
		assert.equal(jsonAudit.schema, 'duplicatefinder.ops-schedule-generator.v1')
		assert.ok(jsonAudit.artifacts.systemdService.includes('MemoryHigh=512M'))
	})

	await t.test('OpsScheduleWorkbench.vue renders empty & populated states, unclamped numeric inputs, and tabs without XSS sinks', async () => {
		const Workbench = loadOpsWorkbench()

		// 1. Empty state still provides baseline systemd/cron generation + Scan storage CTA
		const emptyVm = new Vue({
			render: h => h(Workbench, { props: { duplicates: [], allDuplicates: [] } }),
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.textContent.includes('No duplicate scan dataset loaded yet'))
		assert.ok(emptyVm.$el.textContent.includes('[Service]'))
		emptyVm.$destroy()

		// 2. Populated state with XSS probe lane name
		const sample = buildSampleOpsDuplicates()
		sample[0].files[0].path = '/<img src=x onerror=alert(1)>/files/vm.qcow2'
		const emitted = []
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: sample,
					allDuplicates: sample,
					currentDuplicateId: 501,
				},
				on: {
					'select-duplicate': d => emitted.push(['select', d]),
					'compare-duplicate': d => emitted.push(['compare', d]),
				},
			}),
		}).$mount()
		await settle()

		assert.equal(vm.$el.querySelectorAll('img').length, 0, 'XSS payload must not inject <img>')
		assert.ok(vm.$el.textContent.includes('Target Reclaim Scope'))
		assert.ok(vm.$el.textContent.includes('Preflight Health'))

		// Unclamped numeric input: typing '' or '0' must not mutate input mid-keystroke
		const memHighInput = vm.$el.querySelector('input[aria-label="Systemd MemoryHigh in MiB"]')
		assert.ok(memHighInput)
		memHighInput.value = '0'
		memHighInput.dispatchEvent(new window.Event('input', { bubbles: true }))
		await settle()
		assert.equal(memHighInput.value, '0')

		// Switch preset to Idle-Only Background
		const idlePresetBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Idle-Only Background'))
		assert.ok(idlePresetBtn)
		idlePresetBtn.click()
		await settle()
		assert.equal(idlePresetBtn.getAttribute('aria-pressed'), 'true')
		assert.ok(vm.$el.textContent.includes('IOSchedulingClass=idle'))

		// Switch artifact tab to systemd .timer and runner.sh
		const timerTab = Array.from(vm.$el.querySelectorAll('[role="tab"]')).find(b => b.textContent.includes('systemd .timer'))
		assert.ok(timerTab)
		timerTab.click()
		await settle()
		assert.ok(vm.$el.querySelector('pre.osw__code-pre').textContent.includes('OnCalendar='))

		const runnerTab = Array.from(vm.$el.querySelectorAll('[role="tab"]')).find(b => b.textContent.includes('runner.sh'))
		assert.ok(runnerTab)
		runnerTab.click()
		await settle()
		assert.ok(vm.$el.querySelector('pre.osw__code-pre').textContent.includes('DRY_RUN='))

		// Select a specific sharded lane and emit inspect/compare
		const laneBtn = Array.from(vm.$el.querySelectorAll('button.osw__lane-card')).find(b => b.textContent.includes('GroupFolder #14'))
		assert.ok(laneBtn)
		laneBtn.click()
		await settle()
		const inspectBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Inspect Top Group'))
		assert.ok(inspectBtn)
		inspectBtn.click()
		await settle()
		assert.equal(emitted.length, 1)
		assert.equal(emitted[0][0], 'select')
		assert.equal(emitted[0][1].id, 502)

		vm.$destroy()
	})

	await t.test('App.vue wires topbar Ops Schedule button and @ keyboard shortcut cleanly', async () => {
		const { duplicateStats, opsScheduleGenerator } = loadOpsModules()
		const duplicateFilters = loadModule('src/tools/duplicateFilters.js', {})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js', {})
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const reclamationHistory = loadModule('src/tools/reclamationHistory.js', {
			'./duplicateStats': duplicateStats,
			'./duplicateFilters': duplicateFilters,
		})
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: '@', shiftKey: true }), 'toggle-ops-schedule-generator')

		const stub = name => ({ render(h) { return h('div', { class: `stub-${name}` }) } })
		const slotStub = tag => ({ render(h) { return h(tag, this.$slots.default) } })
		const OpsWorkbench = loadOpsWorkbench()
		const App = loadComponent('src/App.vue', {
			'@nextcloud/vue': {
				NcAppContent: slotStub('div'),
				NcContent: slotStub('div'),
				NcLoadingIcon: stub('loading'),
				NcButton: slotStub('button'),
				NcModal: stub('modal'),
				NcAppSettingsDialog: slotStub('div'),
				NcAppSettingsSection: slotStub('div'),
			},
			'./components/DuplicateNavigation.vue': { __esModule: true, default: stub('nav') },
			'./components/DuplicateDetails.vue': { __esModule: true, default: stub('details') },
			'./components/DuplicateTreemap.vue': { __esModule: true, default: stub('treemap') },
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('history') },
			'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity') },
			'./components/BatchAutoSelectWorkbench.vue': { __esModule: true, default: stub('batch') },
			'./components/FileHygieneInspector.vue': { __esModule: true, default: stub('hygiene') },
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link-sim') },
			'./components/FolderPairMatrix.vue': { __esModule: true, default: stub('folder-matrix') },
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('footprint') },
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
			'./components/OpsScheduleWorkbench.vue': { __esModule: true, default: OpsWorkbench },
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
			'./components/OriginFoldersSettings.vue': { __esModule: true, default: stub('origin') },
			'./components/ExcludedFoldersSettings.vue': { __esModule: true, default: stub('excluded') },
			'./components/BulkDeletionSettings.vue': { __esModule: true, default: stub('bulk') },
			'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects') },
			'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('project-duplicates') },
			'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('onboarding') },
			'./components/help/UsageExamples.vue': { __esModule: true, default: stub('usage') },
			'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
			'./components/FilterSettings.vue': { __esModule: true, default: stub('filter-settings') },
			'@/tools/api': {
				fetchDuplicates: async (status) => ({
					entities: status === 'acknowledged' ? [] : buildSampleOpsDuplicates(),
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
			'@/tools/opsScheduleGenerator': opsScheduleGenerator,
			'vue-material-design-icons/Folder': stub('icon-folder'),
			'vue-material-design-icons/FolderRemove': stub('icon-folder-remove'),
			'vue-material-design-icons/FolderMultiple': stub('icon-folder-multiple'),
			'vue-material-design-icons/Delete': stub('icon-delete'),
			'vue-material-design-icons/FilterOutline': stub('icon-filter'),
		})

		const vm = new Vue({
			render: h => h(App),
		}).$mount()
		await settle()

		const appComp = vm.$children[0]
		const topBtn = vm.$el.querySelector('button.topbar-ops-schedule-button')
		assert.ok(topBtn, 'Topbar Ops Schedule button rendered')
		assert.equal(topBtn.getAttribute('aria-keyshortcuts'), '@')
		assert.equal(appComp.opsScheduleOpen, false)

		appComp.handleGlobalKeydown({
			key: '@',
			shiftKey: true,
			ctrlKey: false,
			metaKey: false,
			altKey: false,
			target: vm.$el,
			preventDefault: () => {},
		})
		await settle()
		assert.equal(appComp.opsScheduleOpen, true)
		assert.ok(vm.$el.querySelector('.ops-schedule-workbench'))

		topBtn.click()
		await settle()
		assert.equal(appComp.opsScheduleOpen, false)

		vm.$destroy()
	})

	await t.test('source files contain zero typographic dashes, zero XSS sinks, and enforce 44px targets & focus-visible', () => {
		const files = [
			'src/tools/opsScheduleGenerator.js',
			'src/components/OpsScheduleWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(__dirname, '../..', rel), 'utf8')
			assert.equal(content.includes('\u2013'), false, `No U+2013 in ${rel}`)
			assert.equal(content.includes('\u2014'), false, `No U+2014 in ${rel}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `No XSS sink in ${rel}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/OpsScheduleWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes('min-block-size: 44px'))
		assert.ok(vueContent.includes(':focus-visible'))
	})
})
