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
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateSortHelper = loadModule('src/tools/duplicateSortHelper.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
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
		'@/tools/duplicateSelectionAndExport': duplicateSelectionAndExport,
		'@/tools/duplicateSortHelper': duplicateSortHelper,
		'@/tools/duplicateStats': duplicateStats,
	})
}

describe('Cycle 59: deterministic duplicate sorting helper and reclaimable sort option', () => {
	beforeEach(() => {
		window.localStorage.clear()
		delete window.OC.currentUser
	})

	afterEach(() => {
		window.localStorage.clear()
		delete window.OC.currentUser
	})

	test('sortDuplicatesDeterministically handles degenerate inputs safely and never mutates the input array', () => {
		const { sortDuplicatesDeterministically } = loadModule('src/tools/duplicateSortHelper.js')

		assert.deepEqual(sortDuplicatesDeterministically(null), [])
		assert.deepEqual(sortDuplicatesDeterministically(undefined), [])
		assert.deepEqual(sortDuplicatesDeterministically('not-an-array'), [])
		assert.deepEqual(sortDuplicatesDeterministically([]), [])
		assert.deepEqual(sortDuplicatesDeterministically([null, undefined, 42, 'bad']), [])

		const input = [
			{
				id: 1,
				files: [
					{ path: '/u/files/z/small.txt', size: 100 },
					{ path: '/u/files/a/small.txt', size: 100 },
				],
			},
			{
				id: 2,
				files: [
					{ path: '/u/files/b/large.bin', size: 5000 },
					{ path: '/u/files/c/large.bin', size: 5000 },
				],
			},
		]
		const snapshot = JSON.stringify(input)
		const sorted = sortDuplicatesDeterministically(input)

		assert.notEqual(sorted, input)
		assert.deepEqual(sorted.map(d => d.id), [2, 1])
		assert.equal(JSON.stringify(input), snapshot, 'input array and nested files must remain untouched')
	})

	test('sortDuplicatesDeterministically defaults to reclaimable ((count - 1) * size) desc and supports asc', () => {
		const { sortDuplicatesDeterministically, getDuplicateSortMetrics } = loadModule('src/tools/duplicateSortHelper.js')
		const MB = 1024 * 1024

		// Group A: 2 copies * 10 MB -> total 20 MB, unit 10 MB, reclaimable 10 MB
		const twoLarge = {
			id: 'two-large',
			files: [
				{ path: '/u/files/Videos/movie.mp4', size: 10 * MB },
				{ path: '/u/files/Backups/movie.mp4', size: 10 * MB },
			],
		}
		// Group B: 5 copies * 3 MB -> total 15 MB, unit 3 MB, reclaimable 12 MB (most wasted!)
		const fiveMedium = {
			id: 'five-medium',
			files: [
				{ path: '/u/files/Photos/1/trip.jpg', size: 3 * MB },
				{ path: '/u/files/Photos/2/trip.jpg', size: 3 * MB },
				{ path: '/u/files/Photos/3/trip.jpg', size: 3 * MB },
				{ path: '/u/files/Photos/4/trip.jpg', size: 3 * MB },
				{ path: '/u/files/Photos/5/trip.jpg', size: 3 * MB },
			],
		}
		// Group C: singleton 50 MB -> reclaimable 0
		const singleton = {
			id: 'singleton',
			files: [
				{ path: '/u/files/ISOs/ubuntu.iso', size: 50 * MB },
			],
		}
		// Group D: summary shape { count: 4, size: 2 MB } -> reclaimable 6 MB
		const summaryGroup = {
			id: 'summary-group',
			name: 'archive.zip',
			path: '/Archives/archive.zip',
			count: 4,
			size: 2 * MB,
		}

		assert.equal(getDuplicateSortMetrics(fiveMedium).reclaimable, 12 * MB)
		assert.equal(getDuplicateSortMetrics(twoLarge).reclaimable, 10 * MB)
		assert.equal(getDuplicateSortMetrics(summaryGroup).reclaimable, 6 * MB)
		assert.equal(getDuplicateSortMetrics(singleton).reclaimable, 0)

		const descDefault = sortDuplicatesDeterministically([twoLarge, singleton, summaryGroup, fiveMedium])
		assert.deepEqual(
			descDefault.map(d => d.id),
			['five-medium', 'two-large', 'summary-group', 'singleton'],
		)

		const ascReclaimable = sortDuplicatesDeterministically(
			[twoLarge, singleton, summaryGroup, fiveMedium],
			{ sortBy: 'reclaimable', direction: 'asc' },
		)
		assert.deepEqual(
			ascReclaimable.map(d => d.id),
			['singleton', 'summary-group', 'two-large', 'five-medium'],
		)
	})

	test('sortDuplicatesDeterministically supports size, count, and name in both desc and asc with deterministic tie-breakers', () => {
		const { sortDuplicatesDeterministically } = loadModule('src/tools/duplicateSortHelper.js')

		const items = [
			{ id: 1, name: 'Beta.txt', path: '/b/Beta.txt', size: 200, count: 3 }, // reclaimable: 400
			{ id: 2, name: 'alpha.txt', path: '/z/alpha.txt', size: 200, count: 3 }, // reclaimable: 400
			{ id: 3, name: 'gamma.txt', path: '/a/gamma.txt', size: 500, count: 2 }, // reclaimable: 500
			{ id: 4, name: 'alpha.txt', path: '/a/alpha.txt', size: 200, count: 3 }, // reclaimable: 400 (same name, earlier path than id 2)
			{ id: 5, name: 'delta.txt', path: '/d/delta.txt', size: 100, count: 5 }, // reclaimable: 400
		]

		// Reclaimable desc: gamma (500) first, then the 400-byte ties sorted by name/path: alpha(/a) < alpha(/z) < Beta < delta
		assert.deepEqual(
			sortDuplicatesDeterministically(items, { sortBy: 'reclaimable', direction: 'desc' }).map(d => d.id),
			[3, 4, 2, 1, 5],
		)

		// Size desc: gamma (500), then 200 ties (4, 2, 1), then delta (100)
		assert.deepEqual(
			sortDuplicatesDeterministically(items, { sortBy: 'size', direction: 'desc' }).map(d => d.id),
			[3, 4, 2, 1, 5],
		)

		// Size asc: delta (100), then 200 ties (4, 2, 1), then gamma (500)
		assert.deepEqual(
			sortDuplicatesDeterministically(items, { sortBy: 'size', direction: 'asc' }).map(d => d.id),
			[5, 4, 2, 1, 3],
		)

		// Count desc: delta (5), then 3 ties (4, 2, 1), then gamma (2)
		assert.deepEqual(
			sortDuplicatesDeterministically(items, { sortBy: 'count', direction: 'desc' }).map(d => d.id),
			[5, 4, 2, 1, 3],
		)

		// Count asc: gamma (2), then 3 ties (4, 2, 1), then delta (5)
		assert.deepEqual(
			sortDuplicatesDeterministically(items, { sortBy: 'count', direction: 'asc' }).map(d => d.id),
			[3, 4, 2, 1, 5],
		)

		// Name default (asc): alpha(/a), alpha(/z), Beta, delta, gamma
		assert.deepEqual(
			sortDuplicatesDeterministically(items, { sortBy: 'name' }).map(d => d.id),
			[4, 2, 1, 5, 3],
		)

		// Name desc: gamma, delta, Beta, alpha(/z), alpha(/a)
		assert.deepEqual(
			sortDuplicatesDeterministically(items, { sortBy: 'name', direction: 'desc' }).map(d => d.id),
			[3, 5, 1, 2, 4],
		)

		// Reversed input order yields the exact same deterministic order
		assert.deepEqual(
			sortDuplicatesDeterministically([...items].reverse(), { sortBy: 'reclaimable', direction: 'desc' }).map(d => d.id),
			[3, 4, 2, 1, 5],
		)
	})

	test('DuplicateNavigation integrates Reclaimable space (most wasted first) sort option and persists preference', async () => {
		const { DEFAULT_ALLOWED_SORT_KEYS, getTriagePreferencesStorageKey } = loadModule('src/tools/duplicatePreferences.js')
		assert.ok(DEFAULT_ALLOWED_SORT_KEYS.includes('reclaimable-desc'))

		window.OC.currentUser = 'reclaim-tester'
		const storageKey = getTriagePreferencesStorageKey()
		const DuplicateNavigation = createNavigationComponent()
		const MB = 1024 * 1024

		const unacknowledged = [
			{
				id: 1,
				hash: 'two-big',
				files: [
					{ id: 11, path: '/reclaim-tester/files/a/movie.mp4', mimetype: 'video/mp4', size: 10 * MB },
					{ id: 12, path: '/reclaim-tester/files/b/movie.mp4', mimetype: 'video/mp4', size: 10 * MB },
				],
			}, // 10 MB reclaimable
			{
				id: 2,
				hash: 'four-medium',
				files: [
					{ id: 21, path: '/reclaim-tester/files/p1/clip.mov', mimetype: 'video/quicktime', size: 4 * MB },
					{ id: 22, path: '/reclaim-tester/files/p2/clip.mov', mimetype: 'video/quicktime', size: 4 * MB },
					{ id: 23, path: '/reclaim-tester/files/p3/clip.mov', mimetype: 'video/quicktime', size: 4 * MB },
					{ id: 24, path: '/reclaim-tester/files/p4/clip.mov', mimetype: 'video/quicktime', size: 4 * MB },
				],
			}, // 12 MB reclaimable
			{
				id: 3,
				hash: 'tie-zebra',
				files: [
					{ id: 31, path: '/reclaim-tester/files/a/zebra.jpg', mimetype: 'image/jpeg', size: 5 * MB },
					{ id: 32, path: '/reclaim-tester/files/b/zebra.jpg', mimetype: 'image/jpeg', size: 5 * MB },
					{ id: 33, path: '/reclaim-tester/files/c/zebra.jpg', mimetype: 'image/jpeg', size: 5 * MB },
				],
			}, // 10 MB reclaimable
			{
				id: 4,
				hash: 'tie-alpha',
				files: [
					{ id: 41, path: '/reclaim-tester/files/z/alpha.jpg', mimetype: 'image/jpeg', size: 5 * MB },
					{ id: 42, path: '/reclaim-tester/files/y/alpha.jpg', mimetype: 'image/jpeg', size: 5 * MB },
					{ id: 43, path: '/reclaim-tester/files/x/alpha.jpg', mimetype: 'image/jpeg', size: 5 * MB },
				],
			}, // 10 MB reclaimable
		]

		const emitted = []
		const vm = new Vue({
			render(h) {
				return h(DuplicateNavigation, {
					ref: 'nav',
					props: {
						acknowledgedDuplicates: [],
						unacknowledgedDuplicates: unacknowledged,
					},
					on: {
						'query-options-changed': payload => emitted.push(payload),
					},
				})
			},
		}).$mount()
		await settle()

		// Open sort menu and verify Reclaimable space (most wasted first) option is present
		const sortToggle = vm.$el.querySelector('button.icon-only-button')
		sortToggle.click()
		await settle()

		const sortButtons = Array.from(vm.$el.querySelectorAll('button.sort-option'))
		const reclaimBtn = sortButtons.find(btn => btn.textContent.includes('Reclaimable space (most wasted first)'))
		assert.ok(reclaimBtn, 'sort menu must expose Reclaimable space (most wasted first) button')
		assert.equal(reclaimBtn.getAttribute('aria-pressed'), 'false')

		reclaimBtn.click()
		await settle()

		const nav = vm.$refs.nav
		assert.equal(nav.sortOption, 'reclaimable-desc')
		assert.equal(nav.hasActiveSortOrFilter, true)
		assert.equal(nav.showSortMenu, false)
		// 12 MB (id 2) first, then 10 MB ties sorted lexicographically: alpha.jpg (id 4), movie.mp4 (id 1), zebra.jpg (id 3)
		assert.deepEqual(nav.filteredUnacknowledgedDuplicates.map(d => d.id), [2, 4, 1, 3])
		assert.deepEqual(emitted[emitted.length - 1], { sortBy: 'reclaimable-desc', minSize: 0 })
		assert.deepEqual(JSON.parse(window.localStorage.getItem(storageKey)), {
			category: 'all',
			sortKey: 'reclaimable-desc',
			uiLevel: 'normal',
		})

		vm.$destroy()

		// Remount restores 'reclaimable-desc' from triage preferences
		const vmReloaded = new Vue({
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

		assert.equal(vmReloaded.$refs.nav.sortOption, 'reclaimable-desc')
		assert.deepEqual(vmReloaded.$refs.nav.filteredUnacknowledgedDuplicates.map(d => d.id), [2, 4, 1, 3])
		vmReloaded.$el.querySelector('button.icon-only-button').click()
		await settle()
		const restoredReclaimBtn = Array.from(vmReloaded.$el.querySelectorAll('button.sort-option'))
			.find(btn => btn.textContent.includes('Reclaimable space (most wasted first)'))
		assert.equal(restoredReclaimBtn.getAttribute('aria-pressed'), 'true')

		vmReloaded.$destroy()
	})

	test('duplicateSortHelper and DuplicateNavigation sort UI enforce logical CSS, >= 44px targets, focus-visible, zero XSS, and zero dashes', () => {
		const helperSource = readFileSync(resolve(root, 'src/tools/duplicateSortHelper.js'), 'utf8')
		const prefsSource = readFileSync(resolve(root, 'src/tools/duplicatePreferences.js'), 'utf8')
		const utilsSource = readFileSync(resolve(root, 'src/tools/utils.js'), 'utf8')
		const navSource = readFileSync(resolve(root, 'src/components/DuplicateNavigation.vue'), 'utf8')

		for (const content of [helperSource, prefsSource, utilsSource, navSource]) {
			assert.ok(!/[\u2013\u2014]/.test(content), 'no U+2013/U+2014 dashes allowed')
			assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(content), 'no DOM XSS sinks allowed')
		}

		const sortCssStart = navSource.indexOf('.sort-menu {')
		const sortCssEnd = navSource.indexOf('.sort-option:hover {')
		const sortCssBlock = navSource.slice(sortCssStart, sortCssEnd)
		assert.ok(sortCssBlock.includes('min-inline-size: 44px'))
		assert.ok(sortCssBlock.includes('min-block-size: 44px'))
		assert.ok(sortCssBlock.includes('overflow-wrap: anywhere'))
		assert.ok(!/(?:margin|padding|border)-(?:left|right|top|bottom)/.test(sortCssBlock), 'sort menu CSS uses logical properties only')
		assert.ok(navSource.includes('.sort-option:focus-visible'))
	})
})
