const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { Vue, loadComponent, loadModule, settle } = require('./helpers.cjs')

const slotBox = tag => ({
	render(h) {
		return h(tag, { on: this.$listeners }, this.$slots.default)
	},
})

function makeDup(id, acknowledged = false, size = 1024) {
	return {
		id,
		hash: `hash-${id}`,
		acknowledged,
		files: [
			{ id: id * 10 + 1, nodeId: id * 100 + 1, mimetype: 'text/plain', size, path: `/alice/files/A/doc-${id}.txt` },
			{ id: id * 10 + 2, nodeId: id * 100 + 2, mimetype: 'text/plain', size, path: `/alice/files/B/doc-${id}.txt` },
		],
	}
}

function createHarness(fetchDuplicatesImpl) {
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})
	const NcAppNavigationItemStub = {
		name: 'NcAppNavigationItemStub',
		props: ['name', 'title', 'allowCollapse', 'open', 'active'],
		render(h) {
			return h(
				'li',
				{ attrs: { 'data-nav-name': this.name } },
				[
					h(
						'a',
						{
							class: 'app-navigation-entry-link',
							attrs: { href: '#' },
							on: { click: event => this.$emit('click', event) },
						},
						[this.name],
					),
					h('div', { class: 'children' }, this.$slots.default),
				],
			)
		},
	}
	const DuplicateListItem = loadComponent('src/components/DuplicateListItem.vue', {
		'@nextcloud/vue': { NcAppNavigationItem: NcAppNavigationItemStub },
		'@/tools/utils': utils,
	})
	const icon = slotBox('span')
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
		'@/tools/api': { fetchDuplicates: fetchDuplicatesImpl },
		'@/tools/utils': utils,
	})

	const stub = name => ({
		name,
		props: ['duplicate', 'projectId', 'show', 'isScanning'],
		render(h) {
			return h('div', { class: `stub-${name}` })
		},
	})

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
		'@/tools/api': {
			fetchDuplicates: fetchDuplicatesImpl,
			fetchProjects: async () => [],
		},
		'@/tools/utils': utils,
		'vue-material-design-icons/Folder': icon,
		'vue-material-design-icons/FolderRemove': icon,
		'vue-material-design-icons/FolderMultiple': icon,
		'vue-material-design-icons/Delete': icon,
		'vue-material-design-icons/FilterOutline': icon,
	})

	return { App, DuplicateNavigation }
}

describe('Issue 227: automatically load more duplicate groups when reaching the end of the list', () => {
	test('api.js forwards exact offset parameter when provided', async () => {
		const urls = []
		const api = loadModule('src/tools/api.js', {
			axios: {
				defaults: { headers: { common: {} } },
				get: async url => {
					urls.push(url)
					return { data: { entities: [], pagination: { currentPage: 1, totalPages: 1 } } }
				},
			},
			'@nextcloud/router': { generateUrl: p => p },
			'@/tools/notifications': { showSuccessNotification: () => {}, showErrorNotification: () => {} },
			'@/tools/utils': { normalizeItemPath: p => p },
		})

		await api.fetchDuplicates('unacknowledged', 50, 2, { sortBy: 'none', minSize: 0, offset: 2 })
		assert.equal(urls[0], '/apps/duplicatefinder/api/duplicates/unacknowledged?limit=50&page=2&offset=2')
	})

	test('selecting the second-to-last or last displayed duplicate automatically loads the next batch until all results are loaded', async () => {
		const serverUnack = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(id => makeDup(id, false))
		const calls = []

		const fetchDuplicates = async (type, limit, page, options = {}) => {
			calls.push({ type, limit, page, options })
			if (type === 'acknowledged') {
				return {
					entities: [],
					pagination: { currentPage: 1, totalPages: 1, totalItems: 0, limit, offset: 0, nextOffset: 0, hasMore: false },
				}
			}
			const batchSize = 4
			const offset = Number.isInteger(options.offset) ? options.offset : (page - 1) * batchSize
			const slice = serverUnack.slice(offset, offset + batchSize)
			const nextOffset = offset + slice.length
			return {
				entities: slice,
				pagination: {
					currentPage: page,
					totalPages: Math.ceil(serverUnack.length / batchSize),
					totalItems: serverUnack.length,
					limit: batchSize,
					offset,
					nextOffset,
					hasMore: nextOffset < serverUnack.length,
				},
			}
		}

		const { App } = createHarness(fetchDuplicates)
		const vm = new Vue(App).$mount()
		await settle()

		// Initial load: 4 items (1..4), item 1 selected, no extra batch fetched yet
		assert.deepEqual(vm.unacknowledgedDuplicates.map(d => d.id), [1, 2, 3, 4])
		assert.equal(vm.currentDuplicate.id, 1)
		const unackCallsInitial = calls.filter(c => c.type === 'unacknowledged')
		assert.equal(unackCallsInitial.length, 1)

		// Selecting item 2 (not yet second-to-last) does NOT fetch
		await vm.openDuplicate(vm.unacknowledgedDuplicates[1])
		await settle()
		assert.equal(calls.filter(c => c.type === 'unacknowledged').length, 1)

		// Selecting item 3 (second-to-last of 4, index 2 >= 4 - 2) automatically loads batch 2 (5..8)
		await vm.openDuplicate(vm.unacknowledgedDuplicates[2])
		await settle()
		assert.equal(calls.filter(c => c.type === 'unacknowledged').length, 2)
		assert.equal(calls.filter(c => c.type === 'unacknowledged')[1].options.offset, 4)
		assert.deepEqual(vm.unacknowledgedDuplicates.map(d => d.id), [1, 2, 3, 4, 5, 6, 7, 8])
		assert.equal(vm.currentDuplicate.id, 3)

		// Selecting item 7 (second-to-last of 8, index 6 >= 8 - 2) automatically loads final batch 3 (9..10)
		await vm.openDuplicate(vm.unacknowledgedDuplicates[6])
		await settle()
		assert.equal(calls.filter(c => c.type === 'unacknowledged').length, 3)
		assert.equal(calls.filter(c => c.type === 'unacknowledged')[2].options.offset, 8)
		assert.deepEqual(vm.unacknowledgedDuplicates.map(d => d.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

		// Reaching item 10 (last of all 10) does NOT fire any further request because hasMore is false
		await vm.openDuplicate(vm.unacknowledgedDuplicates[9])
		await settle()
		assert.equal(calls.filter(c => c.type === 'unacknowledged').length, 3)
		assert.equal(vm.$el.querySelector('.duplicate-section-unacknowledged .load-more-button'), null)

		vm.$destroy()
	})

	test('working through duplicates by deleting or acknowledging adjusts DB offset so zero rows are skipped and auto-loads at 2 remaining items', async () => {
		// Simulate live DB table of 9 unacknowledged duplicates (1..9) with batchSize=4
		let dbUnack = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(id => makeDup(id, false))
		let dbAck = []
		const unackFetchOffsets = []

		const fetchDuplicates = async (type, limit, page, options = {}) => {
			const table = type === 'acknowledged' ? dbAck : dbUnack
			const batchSize = 4
			const offset = Number.isInteger(options.offset) ? options.offset : (page - 1) * batchSize
			if (type === 'unacknowledged') {
				unackFetchOffsets.push(offset)
			}
			const slice = table.slice(offset, offset + batchSize)
			const nextOffset = offset + slice.length
			return {
				entities: slice,
				pagination: {
					currentPage: page,
					totalPages: Math.max(1, Math.ceil(table.length / batchSize)),
					totalItems: table.length,
					limit: batchSize,
					offset,
					nextOffset,
					hasMore: nextOffset < table.length,
				},
			}
		}

		const { App } = createHarness(fetchDuplicates)
		const vm = new Vue(App).$mount()
		await settle()

		// Initial batch: [1, 2, 3, 4]
		assert.deepEqual(vm.unacknowledgedDuplicates.map(d => d.id), [1, 2, 3, 4])
		assert.deepEqual(unackFetchOffsets, [0])

		// Resolve item 1 (deleted in DB and UI) -> 3 items left [2, 3, 4], no fetch yet
		dbUnack = dbUnack.filter(d => d.id !== 1)
		vm.handleDuplicateResolved({ duplicate: vm.unacknowledgedDuplicates[0], type: 'unacknowledged' })
		await settle()
		assert.deepEqual(vm.unacknowledgedDuplicates.map(d => d.id), [2, 3, 4])
		assert.deepEqual(unackFetchOffsets, [0])

		// Acknowledge item 2 (moves from dbUnack to dbAck in DB and UI) -> 2 items left [3, 4] (second-to-last!)
		// Must auto-fetch with offset=2 (skipping 3 and 4 at DB indices 0..1, fetching 5..8 without skipping 3..4's successors!)
		const ackedItem = { ...vm.unacknowledgedDuplicates[0], acknowledged: true }
		dbUnack = dbUnack.filter(d => d.id !== 2)
		dbAck.push(ackedItem)
		await vm.updateDuplicate(ackedItem)
		await settle()

		assert.deepEqual(unackFetchOffsets, [0, 2])
		assert.deepEqual(vm.unacknowledgedDuplicates.map(d => d.id), [3, 4, 5, 6, 7, 8])
		assert.equal(vm.currentDuplicate.id, 3)

		// Now resolve 3, 4, 5, 6 -> when 6 is resolved, [7, 8] (2 items left!) triggers final batch at offset=2 -> fetches [9]
		for (const resolvedId of [3, 4, 5]) {
			dbUnack = dbUnack.filter(d => d.id !== resolvedId)
			vm.handleDuplicateResolved({ duplicate: vm.unacknowledgedDuplicates[0], type: 'unacknowledged' })
			await settle()
		}
		assert.deepEqual(vm.unacknowledgedDuplicates.map(d => d.id), [6, 7, 8])
		assert.deepEqual(unackFetchOffsets, [0, 2])

		dbUnack = dbUnack.filter(d => d.id !== 6)
		vm.handleDuplicateResolved({ duplicate: vm.unacknowledgedDuplicates[0], type: 'unacknowledged' })
		await settle()

		// Reaching 2 items [7, 8] auto-fetched [9] at offset=2!
		assert.deepEqual(unackFetchOffsets, [0, 2, 2])
		assert.deepEqual(vm.unacknowledgedDuplicates.map(d => d.id), [7, 8, 9])
		assert.equal(vm.unacknowledgedPagination.hasMore, false)

		vm.$destroy()
	})
})
