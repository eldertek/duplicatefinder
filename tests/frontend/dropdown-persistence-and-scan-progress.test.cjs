const { describe, test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

const slotBox = tag => ({
	render(h) {
		return h(tag, { on: this.$listeners }, this.$slots.default)
	},
})

function createNavigationComponent(utils) {
	const NcAppNavigationItemStub = {
		name: 'NcAppNavigationItemStub',
		props: ['name', 'title', 'allowCollapse', 'open', 'active'],
		render(h) {
			return h(
				'li',
				{
					class: {
						'nc-nav-item': true,
						'nc-nav-open': Boolean(this.open),
						'nc-nav-active': Boolean(this.active),
					},
					attrs: { 'data-nav-name': this.name },
				},
				[
					h('div', { class: 'app-navigation-entry' }, [
						h(
							'a',
							{
								class: 'app-navigation-entry-link',
								attrs: { href: '#' },
								on: { click: event => this.$emit('click', event) },
							},
							[this.$slots.icon, h('span', this.name)],
						),
						this.allowCollapse
							? h(
								'button',
								{
									class: 'icon-collapse',
									attrs: { type: 'button' },
									on: {
										click: event => {
											event.preventDefault()
											event.stopPropagation()
											this.$emit('update:open', !this.open)
										},
									},
								},
								[this.open ? '^' : 'v'],
							)
							: null,
					]),
					this.allowCollapse && !this.open
						? null
						: h('ul', { class: 'app-navigation-entry__children' }, this.$slots.default),
				],
			)
		},
	}

	const DuplicateListItem = loadComponent('src/components/DuplicateListItem.vue', {
		'@nextcloud/vue': { NcAppNavigationItem: NcAppNavigationItemStub },
		'@/tools/utils': utils,
	})

	const icon = slotBox('span')
	return loadComponent('src/components/DuplicateNavigation.vue', {
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
		'./SearchBar.vue': {
			render(h) {
				return h('input', { attrs: { type: 'search' } })
			},
		},
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
	})
}

function createAppHarness(apiOverrides = {}) {
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})
	const icon = slotBox('span')
	const stub = name => ({
		name,
		props: ['duplicate', 'projectId', 'show', 'isScanning'],
		render(h) {
			return h('div', { class: `stub-${name}` })
		},
	})

	const api = {
		fetchDuplicates: async () => ({
			entities: [],
			pagination: { currentPage: 1, totalPages: 1, totalItems: 0 },
		}),
		fetchProjects: async () => [],
		fetchScanStatus: async () => ({
			running: false,
			indeterminate: false,
			scannedFiles: 0,
			totalFiles: 0,
			percentage: 0,
			completedSeq: 1,
			etaSeconds: null,
		}),
		startUserScan: async () => null,
		notifyScanStarted: () => {},
		notifyScanCompleted: () => {},
		notifyScanFailed: () => {},
		...apiOverrides,
	}

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
		'./components/DuplicateNavigation.vue': {
			__esModule: true,
			default: createNavigationComponent(utils),
		},
		'./components/DuplicateDetails.vue': { __esModule: true, default: stub('duplicate-details') },
		'./components/OriginFoldersSettings.vue': { __esModule: true, default: stub('origin-folders') },
		'./components/ExcludedFoldersSettings.vue': { __esModule: true, default: stub('excluded-folders') },
		'./components/BulkDeletionSettings.vue': { __esModule: true, default: stub('bulk-deletion') },
		'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects-settings') },
		'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('project-duplicates') },
		'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('guide') },
		'./components/help/UsageExamples.vue': { __esModule: true, default: stub('examples') },
		'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
		'./components/SearchBar.vue': { __esModule: true, default: stub('search-bar') },
		'./components/FilterSettings.vue': { __esModule: true, default: stub('filter-settings') },
		'@/tools/api': api,
		'@/tools/utils': utils,
		'vue-material-design-icons/Folder': icon,
		'vue-material-design-icons/FolderRemove': icon,
		'vue-material-design-icons/FolderMultiple': icon,
		'vue-material-design-icons/Delete': icon,
		'vue-material-design-icons/FilterOutline': icon,
	})

	return { App, utils, api }
}

describe('Issue 212 and Issue 206: persistent dropdown states, scan progress banner, and automatic list refresh', () => {
	beforeEach(() => {
		window.localStorage.clear()
		delete window.OC.currentUser
	})

	afterEach(() => {
		window.localStorage.clear()
		delete window.OC.currentUser
	})

	test('Issue 212: Acknowledged and Unacknowledged dropdown states persist independently across page reloads and per user', async () => {
		window.OC.currentUser = 'qa-alice'
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const DuplicateNavigation = createNavigationComponent(utils)

		const vm1 = new Vue({
			render(h) {
				return h(DuplicateNavigation, {
					ref: 'nav',
					props: {
						acknowledgedDuplicates: [],
						unacknowledgedDuplicates: [],
						activeView: 'details',
					},
				})
			},
		}).$mount()
		await settle()

		// Default on first visit: both expanded
		assert.equal(vm1.$refs.nav.acknowledgedOpen, true)
		assert.equal(vm1.$refs.nav.unacknowledgedOpen, true)

		// Collapse Acknowledged while keeping Unacknowledged expanded
		const ackLink = vm1.$el.querySelector('li[data-nav-name="Acknowledged"] > .app-navigation-entry > .app-navigation-entry-link')
		ackLink.click()
		await settle()
		assert.equal(vm1.$refs.nav.acknowledgedOpen, false)
		assert.equal(vm1.$refs.nav.unacknowledgedOpen, true)
		vm1.$destroy()

		// Simulate full page reload for qa-alice: Acknowledged stays collapsed, Unacknowledged stays expanded
		const vm2 = new Vue({
			render(h) {
				return h(DuplicateNavigation, {
					ref: 'nav',
					props: {
						acknowledgedDuplicates: [],
						unacknowledgedDuplicates: [],
						activeView: 'details',
					},
				})
			},
		}).$mount()
		await settle()
		assert.equal(vm2.$refs.nav.acknowledgedOpen, false)
		assert.equal(vm2.$refs.nav.unacknowledgedOpen, true)
		assert.equal(
			vm2.$el.querySelector('li[data-nav-name="Acknowledged"]').classList.contains('nc-nav-open'),
			false,
		)
		assert.equal(
			vm2.$el.querySelector('li[data-nav-name="Unacknowledged"]').classList.contains('nc-nav-open'),
			true,
		)

		// Now flip both via chevron buttons: expand Acknowledged, collapse Unacknowledged
		vm2.$el.querySelector('li[data-nav-name="Acknowledged"] .icon-collapse').click()
		vm2.$el.querySelector('li[data-nav-name="Unacknowledged"] .icon-collapse').click()
		await settle()
		assert.equal(vm2.$refs.nav.acknowledgedOpen, true)
		assert.equal(vm2.$refs.nav.unacknowledgedOpen, false)
		vm2.$destroy()

		// Another reload for qa-alice restores acknowledged=true, unacknowledged=false
		const vm3 = new Vue({
			render(h) {
				return h(DuplicateNavigation, {
					ref: 'nav',
					props: {
						acknowledgedDuplicates: [],
						unacknowledgedDuplicates: [],
						activeView: 'details',
					},
				})
			},
		}).$mount()
		await settle()
		assert.equal(vm3.$refs.nav.acknowledgedOpen, true)
		assert.equal(vm3.$refs.nav.unacknowledgedOpen, false)
		vm3.$destroy()

		// Another user on the same browser starts with independent defaults
		window.OC.currentUser = 'qa-bob'
		const vmBob = new Vue({
			render(h) {
				return h(DuplicateNavigation, {
					ref: 'nav',
					props: {
						acknowledgedDuplicates: [],
						unacknowledgedDuplicates: [],
						activeView: 'details',
					},
				})
			},
		}).$mount()
		await settle()
		assert.equal(vmBob.$refs.nav.acknowledgedOpen, true)
		assert.equal(vmBob.$refs.nav.unacknowledgedOpen, true)
		vmBob.$destroy()
	})

	test('Issue 212: App.vue also persists sortOption and minSizeBytes across reloads', async () => {
		window.OC.currentUser = 'qa-alice'
		const seenQueries = []
		const { App } = createAppHarness({
			fetchDuplicates: async (type, limit, page, options) => {
				seenQueries.push({ type, options })
				return { entities: [], pagination: { currentPage: 1, totalPages: 1, totalItems: 0 } }
			},
		})

		const vm1 = new Vue(App).$mount()
		await settle()
		await vm1.handleQueryOptionsChanged({ sortBy: 'size-desc', minSize: 10 * 1024 * 1024 })
		vm1.$destroy()

		seenQueries.length = 0
		const vm2 = new Vue(App).$mount()
		await settle()

		assert.equal(vm2.sortOption, 'size-desc')
		assert.equal(vm2.minSizeBytes, 10 * 1024 * 1024)
		assert.deepEqual(seenQueries[0].options, { sortBy: 'size-desc', minSize: 10 * 1024 * 1024 })
		vm2.$destroy()
	})

	test('Issue 206: Scan button shows live progress percentage, file count and ETA, then auto-refreshes duplicates without F5', async () => {
		let duplicatesOnServer = []
		let resolveScanRequest
		let completedToastCount = 0

		const { App, utils } = createAppHarness({
			fetchDuplicates: async type => ({
				entities: type === 'unacknowledged' ? duplicatesOnServer : [],
				pagination: {
					currentPage: 1,
					totalPages: 1,
					totalItems: type === 'unacknowledged' ? duplicatesOnServer.length : 0,
				},
			}),
			startUserScan: () =>
				new Promise(resolve => {
					resolveScanRequest = resolve
				}),
			notifyScanCompleted: () => {
				completedToastCount++
			},
		})

		assert.equal(utils.formatScanEta(42), '42s')
		assert.equal(utils.formatScanEta(135), '2m 15s')
		assert.equal(utils.formatScanEta(3900), '1h 5m')

		const vm = new Vue(App).$mount()
		await settle()

		assert.equal(vm.unacknowledgedDuplicates.length, 0)
		const scanBtn = vm.$el.querySelector('.topbar-scan-button')
		assert.ok(scanBtn, 'Scan button is rendered in topbar')
		assert.equal(scanBtn.textContent.trim(), 'Scan')

		// User starts scan
		const scanPromise = vm.triggerScan()
		await settle()

		assert.equal(vm.isScanRunning, true)
		assert.equal(scanBtn.disabled, true)
		assert.equal(scanBtn.textContent.trim(), 'Scanning...')

		// Simulate mid-scan progress poll response (40% - 800 / 2000 files, 75s remaining)
		await vm.applyScanStatus({
			running: true,
			indeterminate: false,
			scannedFiles: 800,
			totalFiles: 2000,
			percentage: 40,
			completedSeq: 1,
			etaSeconds: 75,
		})
		await settle()

		const banner = vm.$el.querySelector('.scan-progress-banner')
		assert.ok(banner, 'scan progress banner is visible while scan runs')
		assert.ok(banner.textContent.includes('800 / 2000 files (40%)'))
		assert.ok(banner.textContent.includes('Estimated remaining 1m 15s'))
		const bar = banner.querySelector('[role="progressbar"]')
		assert.equal(bar.getAttribute('aria-valuenow'), '40')

		// New duplicate discovered on server when scan finishes
		duplicatesOnServer = [
			{
				id: 501,
				hash: 'new-dup-501',
				acknowledged: false,
				files: [
					{ id: 1, nodeId: 10, mimetype: 'image/png', size: 4096, path: '/qa/files/A/pic.png' },
					{ id: 2, nodeId: 11, mimetype: 'image/png', size: 4096, path: '/qa/files/B/pic.png' },
				],
			},
		]
		resolveScanRequest({
			running: false,
			indeterminate: false,
			scannedFiles: 2000,
			totalFiles: 2000,
			percentage: 100,
			completedSeq: 2,
			etaSeconds: 0,
		})
		await scanPromise
		await settle()

		assert.equal(vm.isScanRunning, false)
		assert.equal(vm.$el.querySelector('.scan-progress-banner'), null)
		assert.equal(vm.unacknowledgedDuplicates.length, 1, 'duplicate list refreshed automatically without page reload')
		assert.equal(vm.currentDuplicate.id, 501, 'newly discovered duplicate auto-selected')
		assert.equal(vm.$el.querySelector('.topbar-title').textContent.trim(), 'Duplicates (1)')
		assert.equal(completedToastCount, 1)

		vm.$destroy()
	})

	test('Issue 206: long background scan surviving an HTTP gateway timeout continues polling and auto-refreshes on completion, while initial page load/reload never auto-triggers scan UI', async () => {
		let duplicatesOnServer = []
		let startUserScanCalled = 0
		let liveStatus = {
			running: true,
			indeterminate: false,
			scannedFiles: 72834,
			totalFiles: 72860,
			percentage: 99,
			completedSeq: 10,
			etaSeconds: 1,
		}

		const { App } = createAppHarness({
			fetchDuplicates: async type => ({
				entities: type === 'unacknowledged' ? duplicatesOnServer : [],
				pagination: {
					currentPage: 1,
					totalPages: 1,
					totalItems: type === 'unacknowledged' ? duplicatesOnServer.length : 0,
				},
			}),
			fetchScanStatus: async () => liveStatus,
			startUserScan: async () => {
				startUserScanCalled++
				throw new Error('504 Gateway Timeout')
			},
		})

		const vm = new Vue(App).$mount()
		await settle()
		// Visiting or reloading the page must NEVER start a scan or show a stale scan banner automatically
		assert.equal(startUserScanCalled, 0)
		assert.equal(vm.isScanRunning, false)
		assert.equal(vm.$el.querySelector('.scan-progress-banner'), null)

		// Now the user explicitly clicks Scan, which hits a 504 Gateway Timeout while the server scan is still running
		liveStatus = {
			running: true,
			indeterminate: false,
			scannedFiles: 500,
			totalFiles: 5000,
			percentage: 10,
			completedSeq: 10,
			etaSeconds: 540,
		}
		await vm.triggerScan()
		await settle()
		assert.equal(startUserScanCalled, 1)
		assert.equal(vm.isScanRunning, true)

		// Now simulate background scan finishing on the server
		duplicatesOnServer = [
			{
				id: 777,
				hash: 'bg-dup-777',
				acknowledged: false,
				files: [
					{ id: 1, nodeId: 91, mimetype: 'application/pdf', size: 8192, path: '/qa/files/Doc1.pdf' },
					{ id: 2, nodeId: 92, mimetype: 'application/pdf', size: 8192, path: '/qa/files/Doc2.pdf' },
				],
			},
		]
		liveStatus = {
			running: false,
			indeterminate: false,
			scannedFiles: 5000,
			totalFiles: 5000,
			percentage: 100,
			completedSeq: 11,
			etaSeconds: 0,
		}

		await vm.pollScanStatus()
		await settle()

		assert.equal(vm.isScanRunning, false)
		assert.equal(vm.unacknowledgedDuplicates.length, 1, 'results from 1-hour background scan appear automatically')
		assert.equal(vm.currentDuplicate.id, 777)

		vm.$destroy()
	})
})
