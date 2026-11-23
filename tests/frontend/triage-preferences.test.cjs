const { describe, test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

const slotBox = tag => ({
	render(h) {
		return h(tag, this.$slots.default)
	},
})

function createNavigationComponent() {
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})
	const duplicateFilters = loadModule('src/tools/duplicateFilters.js')
	const duplicatePreferences = loadModule('src/tools/duplicatePreferences.js')
	const icon = slotBox('span')

	const DuplicateListItem = {
		props: ['duplicate', 'isActive'],
		render(h) {
			return h('div', { attrs: { 'data-dup-id': this.duplicate.id } }, this.duplicate.hash)
		},
	}

	return loadComponent('src/components/DuplicateNavigation.vue', {
		'@nextcloud/vue': {
			NcAppNavigation: {
				render(h) {
					return h('nav', this.$scopedSlots.list ? this.$scopedSlots.list() : this.$slots.default)
				},
			},
			NcAppNavigationItem: {
				props: ['name', 'allowCollapse', 'open', 'active'],
				render(h) {
					return h('section', [h('h4', this.name), this.$slots.default])
				},
			},
			NcButton: slotBox('button'),
		},
		'./DuplicateListItem.vue': { __esModule: true, default: DuplicateListItem },
		'./SearchBar.vue': {
			data() {
				return { searchQuery: '' }
			},
			methods: {
				clear() {
					this.searchQuery = ''
				},
			},
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
		'@/tools/duplicateFilters': duplicateFilters,
		'@/tools/duplicatePreferences': duplicatePreferences,
		'@/tools/duplicateSelectionAndExport': loadModule('src/tools/duplicateSelectionAndExport.js'),
		'@/tools/duplicateStats': loadModule('src/tools/duplicateStats.js'),
	})
}

describe('Cycle 42: triage preferences persistence, folder prefix filter, and reset controls', () => {
	beforeEach(() => {
		window.localStorage.clear()
		delete window.OC.currentUser
	})

	afterEach(() => {
		window.localStorage.clear()
		delete window.OC.currentUser
	})

	test('loadTriagePreferences and saveTriagePreferences enforce strict whitelists and strip sensitive fields', () => {
		const {
			loadTriagePreferences,
			saveTriagePreferences,
			getTriagePreferencesStorageKey,
		} = loadModule('src/tools/duplicatePreferences.js')

		const memoryMap = new Map()
		const mockStorage = {
			getItem: key => (memoryMap.has(key) ? memoryMap.get(key) : null),
			setItem: (key, value) => memoryMap.set(key, String(value)),
		}

		// Persist valid whitelisted values while dropping sensitive or unknown keys
		const saved = saveTriagePreferences(mockStorage, {
			category: 'images',
			sortKey: 'size-desc',
			folderQuery: '/Private/Payroll',
			apiToken: 'secret-token-123',
			userEmail: 'alice@example.test',
			arbitraryKey: 'should-not-persist',
		}, {
			allowedCategories: ['all', 'images', 'videos'],
			allowedSortKeys: ['none', 'size-desc', 'size-asc'],
		})
		assert.equal(saved, true)

		const key = getTriagePreferencesStorageKey()
		const rawJson = memoryMap.get(key)
		const parsed = JSON.parse(rawJson)
		assert.deepEqual(parsed, { category: 'images', sortKey: 'size-desc' })
		assert.equal(Object.keys(parsed).length, 2)
		assert.equal(rawJson.includes('Payroll'), false)
		assert.equal(rawJson.includes('secret-token'), false)

		assert.deepEqual(
			loadTriagePreferences(mockStorage, {
				allowedCategories: ['all', 'images', 'videos'],
				allowedSortKeys: ['none', 'size-desc', 'size-asc'],
			}),
			{ category: 'images', sortKey: 'size-desc' },
		)

		// Reject disallowed values via custom whitelists
		saveTriagePreferences(mockStorage, {
			category: '<script>alert(1)</script>',
			sortKey: 'invalid-sort',
		}, {
			allowedCategories: ['all', 'images'],
			allowedSortKeys: ['none', 'size-asc'],
		})
		assert.deepEqual(
			loadTriagePreferences(mockStorage, {
				allowedCategories: ['all', 'images'],
				allowedSortKeys: ['none', 'size-asc'],
			}),
			{ category: 'all', sortKey: 'none' },
		)
	})

	test('loadTriagePreferences and saveTriagePreferences survive corrupted JSON and throwing storage', () => {
		const {
			loadTriagePreferences,
			saveTriagePreferences,
			getTriagePreferencesStorageKey,
		} = loadModule('src/tools/duplicatePreferences.js')

		const key = getTriagePreferencesStorageKey()

		// Corrupted JSON & non-object JSON values
		for (const badPayload of ['{not-valid-json', 'null', '[]', '"images"', '42']) {
			const corruptStorage = {
				getItem: () => badPayload,
			}
			assert.deepEqual(loadTriagePreferences(corruptStorage), {
				category: 'all',
				sortKey: 'none',
			})
		}

		// Storage returning invalid whitelisted values directly from storage
		const tamperedStorage = {
			getItem: k => (k === key ? JSON.stringify({ category: 'videos', sortKey: 'size-asc', extra: 'leak' }) : null),
		}
		assert.deepEqual(
			loadTriagePreferences(tamperedStorage, {
				allowedCategories: ['all', 'images'],
				allowedSortKeys: ['none'],
			}),
			{ category: 'all', sortKey: 'none' },
		)

		// Unavailable storage (null) and throwing storage
		assert.deepEqual(loadTriagePreferences(null), { category: 'all', sortKey: 'none' })
		assert.equal(saveTriagePreferences(null, { category: 'images', sortKey: 'size-desc' }), false)

		const throwingStorage = {
			getItem() {
				throw new Error('SecurityError: localStorage disabled')
			},
			setItem() {
				throw new Error('QuotaExceededError')
			},
		}
		assert.deepEqual(loadTriagePreferences(throwingStorage), { category: 'all', sortKey: 'none' })
		assert.equal(saveTriagePreferences(throwingStorage, { category: 'images', sortKey: 'size-desc' }), false)
	})

	test('filterDuplicatesByFolderPrefix supports inclusive and ! exclusive folder queries with boundary safety', () => {
		const { filterDuplicatesByFolderPrefix } = loadModule('src/tools/duplicatePreferences.js')

		const groups = [
			{
				id: 1,
				files: [
					{ id: 11, path: '/alice/files/Photos/2024/beach.jpg' },
					{ id: 12, path: '/alice/files/Downloads/beach.jpg' },
				],
			},
			{
				id: 2,
				files: [
					{ id: 21, path: '/alice/files/PhotosBackup/archive.jpg' },
					{ id: 22, path: '/alice/files/Backups/archive.jpg' },
				],
			},
			{
				id: 3,
				files: [
					{ id: 31, path: '/alice/files/Documents/report.pdf' },
					{ id: 32, path: '/alice/files/Backups/report.pdf' },
				],
			},
			{
				id: 4,
				files: [
					{ id: 41, path: '/alice/files/Music/song.mp3' },
					{ id: 42, path: '/alice/files/Archive/song.mp3' },
				],
			},
		]

		// Empty / whitespace / lone '!' return all valid groups
		assert.equal(filterDuplicatesByFolderPrefix(groups, '').length, 4)
		assert.equal(filterDuplicatesByFolderPrefix(groups, '   ').length, 4)
		assert.equal(filterDuplicatesByFolderPrefix(groups, '!').length, 4)
		assert.deepEqual(filterDuplicatesByFolderPrefix(null, '/Photos'), [])

		// Inclusive prefix: matches '/Photos/...' but NOT '/PhotosBackup/...'
		assert.deepEqual(
			filterDuplicatesByFolderPrefix(groups, '/Photos').map(g => g.id),
			[1],
		)
		assert.deepEqual(
			filterDuplicatesByFolderPrefix(groups, 'photos/').map(g => g.id),
			[1],
		)

		// Exclusive prefix '!': excludes any group touching '/Backups'
		assert.deepEqual(
			filterDuplicatesByFolderPrefix(groups, '!/Backups').map(g => g.id),
			[1, 4],
		)
		assert.deepEqual(
			filterDuplicatesByFolderPrefix(groups, '! backups/ ').map(g => g.id),
			[1, 4],
		)
	})

	test('DuplicateNavigation restores persisted category/sort, combines folder filter, and shows Reset filters only when active', async () => {
		const { getTriagePreferencesStorageKey } = loadModule('src/tools/duplicatePreferences.js')
		window.OC.currentUser = 'triage-tester'
		const storageKey = getTriagePreferencesStorageKey()

		// Pre-populate storage with saved preferences before mount
		window.localStorage.setItem(storageKey, JSON.stringify({
			category: 'images',
			sortKey: 'size-desc',
		}))

		const DuplicateNavigation = createNavigationComponent()
		const twoMb = 2 * 1024 * 1024
		const fourMb = 4 * 1024 * 1024

		const unacknowledged = [
			{
				id: 1,
				hash: 'small-photo',
				files: [
					{ id: 11, path: '/triage-tester/files/Photos/small.jpg', mimetype: 'image/jpeg', size: twoMb },
					{ id: 12, path: '/triage-tester/files/Downloads/small.jpg', mimetype: 'image/jpeg', size: twoMb },
				],
			},
			{
				id: 2,
				hash: 'large-backup-photo',
				files: [
					{ id: 21, path: '/triage-tester/files/Photos/large.jpg', mimetype: 'image/jpeg', size: fourMb },
					{ id: 22, path: '/triage-tester/files/Backups/large.jpg', mimetype: 'image/jpeg', size: fourMb },
				],
			},
			{
				id: 3,
				hash: 'doc-group',
				files: [
					{ id: 31, path: '/triage-tester/files/Documents/notes.pdf', mimetype: 'application/pdf', size: fourMb },
					{ id: 32, path: '/triage-tester/files/Archive/notes.pdf', mimetype: 'application/pdf', size: fourMb },
				],
			},
		]

		const emittedQueryChanges = []
		const vm = new Vue({
			render(h) {
				return h(DuplicateNavigation, {
					ref: 'nav',
					props: {
						acknowledgedDuplicates: [],
						unacknowledgedDuplicates: unacknowledged,
					},
					on: {
						'query-options-changed': payload => emittedQueryChanges.push(payload),
					},
				})
			},
		}).$mount()
		await settle()

		const nav = vm.$refs.nav
		assert.equal(nav.selectedCategory, 'images')
		assert.equal(nav.sortOption, 'size-desc')
		// Sorted descending by size (id 2 = 8 MB total before id 1 = 4 MB total), doc excluded
		assert.deepEqual(nav.filteredUnacknowledgedDuplicates.map(d => d.id), [2, 1])

		// Reset filters button is visible because restored category/sort are active
		let resetBtn = vm.$el.querySelector('button.reset-filters-button')
		assert.ok(resetBtn, 'Reset filters button is visible when filters/sort are active')

		// Apply exclusive folder prefix filter '!/Backups'
		const folderInput = vm.$el.querySelector('input.folder-filter-input')
		assert.ok(folderInput, 'folder prefix filter input is rendered')
		folderInput.value = '!/Backups'
		folderInput.dispatchEvent(new window.Event('input'))
		await settle()

		assert.deepEqual(nav.filteredUnacknowledgedDuplicates.map(d => d.id), [1])
		// Folder query must NOT be written into persisted triage preferences
		assert.equal(window.localStorage.getItem(storageKey).includes('Backups'), false)

		// Click Reset filters -> clears all active filters, persists defaults, hides button
		resetBtn.click()
		await settle()

		assert.equal(nav.selectedCategory, 'all')
		assert.equal(nav.sortOption, 'none')
		assert.equal(nav.folderQuery, '')
		assert.deepEqual(nav.filteredUnacknowledgedDuplicates.map(d => d.id), [1, 2, 3])
		assert.equal(vm.$el.querySelector('button.reset-filters-button'), null, 'Reset filters hides when inactive')
		assert.deepEqual(
			JSON.parse(window.localStorage.getItem(storageKey)),
			{ category: 'all', sortKey: 'none' },
		)
		assert.deepEqual(emittedQueryChanges[emittedQueryChanges.length - 1], {
			sortBy: 'none',
			minSize: 0,
		})

		// Clicking a category chip saves immediately
		const chips = Array.from(vm.$el.querySelectorAll('button.filter-chip'))
		chips[4].click() // Documents
		await settle()
		assert.equal(nav.selectedCategory, 'documents')
		assert.deepEqual(
			JSON.parse(window.localStorage.getItem(storageKey)),
			{ category: 'documents', sortKey: 'none' },
		)
		assert.ok(vm.$el.querySelector('button.reset-filters-button'), 'Reset filters reappears when category filter is active')

		vm.$destroy()
	})

	test('DuplicateNavigation triage preference UI adheres to >= 44px targets, :focus-visible, logical CSS, and zero XSS/dashes', () => {
		const navSource = readFileSync(resolve(root, 'src/components/DuplicateNavigation.vue'), 'utf8')
		const prefsSource = readFileSync(resolve(root, 'src/tools/duplicatePreferences.js'), 'utf8')

		for (const content of [navSource, prefsSource]) {
			assert.ok(!/[\u2013\u2014]/.test(content), 'no U+2013/U+2014 dashes allowed')
			assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(content), 'no DOM XSS sinks allowed')
		}

		assert.ok(navSource.includes('.folder-filter-input:focus-visible'))
		assert.ok(navSource.includes('.reset-filters-button:focus-visible'))
		assert.ok(navSource.includes('.empty-state-reset-button:focus-visible'))

		const filterCssStart = navSource.indexOf('/* Quick File-Type Filter Chips & Live Reclaimable Summary */')
		const filterCssEnd = navSource.indexOf('/* Consistent highlighting')
		const filterCssBlock = navSource.slice(filterCssStart, filterCssEnd)
		assert.ok(filterCssBlock.includes('.reset-filters-button'))
		assert.ok(filterCssBlock.includes('.empty-state-reset-button'))
		assert.ok(filterCssBlock.includes('min-block-size: 44px'))
		assert.ok(filterCssBlock.includes('min-inline-size: 44px'))
		assert.ok(!/(?:margin|padding|border)-(?:left|right|top|bottom)/.test(filterCssBlock), 'new CSS uses logical properties only')
	})

	test('DuplicateNavigation State A: shows filtered empty message and Reset filters button when duplicates exist but filters match none', async () => {
		const DuplicateNavigation = createNavigationComponent()
		const unacknowledged = [
			{
				id: 101,
				hash: 'photo-only',
				files: [
					{ id: 1011, path: '/alice/files/Photos/holiday.jpg', mimetype: 'image/jpeg', size: 1024 },
					{ id: 1012, path: '/alice/files/Downloads/holiday.jpg', mimetype: 'image/jpeg', size: 1024 },
				],
			},
		]

		const vm = new Vue({
			render(h) {
				return h(DuplicateNavigation, {
					ref: 'nav',
					props: {
						acknowledgedDuplicates: [],
						unacknowledgedDuplicates: unacknowledged,
					},
				})
			},
		}).$mount()
		await settle()

		const nav = vm.$refs.nav
		assert.equal(nav.unacknowledgedEmptyState, 'populated')
		assert.equal(nav.acknowledgedEmptyState, 'initial-empty')

		// Filter to Documents so unacknowledged raw list (> 0) becomes filtered-empty (State A)
		const chips = Array.from(vm.$el.querySelectorAll('button.filter-chip'))
		chips[4].click() // Documents
		await settle()

		assert.equal(nav.unacknowledgedEmptyState, 'filtered-empty')
		const unackSection = vm.$el.querySelector('.duplicate-section-unacknowledged')
		const ackSection = vm.$el.querySelector('.duplicate-section-acknowledged')
		assert.ok(unackSection.textContent.includes('No duplicates match the current filters'))
		assert.ok(ackSection.textContent.includes('No duplicates found yet'))
		assert.equal(ackSection.querySelector('button.empty-state-reset-button'), null)

		const emptyResetBtn = unackSection.querySelector('button.empty-state-reset-button')
		assert.ok(emptyResetBtn, 'State A renders accessible Reset filters button inside empty section')
		assert.ok(emptyResetBtn.textContent.includes('Reset filters'))

		// Clicking State A Reset filters restores populated list and removes empty state
		emptyResetBtn.click()
		await settle()

		assert.equal(nav.selectedCategory, 'all')
		assert.equal(nav.unacknowledgedEmptyState, 'populated')
		assert.equal(unackSection.querySelector('button.empty-state-reset-button'), null)

		vm.$destroy()
	})

	test('DuplicateNavigation State B: shows sober No duplicates found yet message when duplicates.length === 0', async () => {
		const DuplicateNavigation = createNavigationComponent()

		const vm = new Vue({
			render(h) {
				return h(DuplicateNavigation, {
					ref: 'nav',
					props: {
						acknowledgedDuplicates: [],
						unacknowledgedDuplicates: [],
					},
				})
			},
		}).$mount()
		await settle()

		const nav = vm.$refs.nav
		assert.equal(nav.acknowledgedEmptyState, 'initial-empty')
		assert.equal(nav.unacknowledgedEmptyState, 'initial-empty')
		assert.equal(vm.$el.querySelector('button.empty-state-reset-button'), null)

		const ackSection = vm.$el.querySelector('.duplicate-section-acknowledged')
		const unackSection = vm.$el.querySelector('.duplicate-section-unacknowledged')
		assert.ok(ackSection.textContent.includes('No duplicates found yet'))
		assert.ok(unackSection.textContent.includes('No duplicates found yet'))
		assert.equal(vm.$el.textContent.includes('No duplicates match the current filters'), false)

		// Even with an active folder filter, raw length 0 stays in State B
		const folderInput = vm.$el.querySelector('input.folder-filter-input')
		folderInput.value = '/Photos'
		folderInput.dispatchEvent(new window.Event('input'))
		await settle()

		assert.equal(nav.acknowledgedEmptyState, 'initial-empty')
		assert.equal(nav.unacknowledgedEmptyState, 'initial-empty')
		assert.equal(vm.$el.querySelector('button.empty-state-reset-button'), null)
		assert.equal(vm.$el.textContent.includes('No duplicates match the current filters'), false)

		vm.$destroy()
	})
})
