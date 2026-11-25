const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle } = require('./helpers.cjs')

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
		'@/tools/duplicateSortHelper': loadModule('src/tools/duplicateSortHelper.js'),
		'@/tools/duplicateStats': duplicateStats,
	})
}

describe('Cycle 48: duplicate extension breakdown stats and navigation insights bar', () => {
	test('extractNormalizedExtension and getDuplicateExtension normalize extensions and handle extensionless files', () => {
		const {
			extractNormalizedExtension,
			getDuplicateExtension,
			matchesDuplicateExtension,
		} = loadModule('src/tools/duplicateStats.js')

		assert.equal(extractNormalizedExtension('/alice/files/Photos/IMG_001.JPG'), '.jpg')
		assert.equal(extractNormalizedExtension('C:\\Users\\alice\\clip.MP4?download=1'), '.mp4')
		assert.equal(extractNormalizedExtension('/alice/files/.gitignore'), 'other')
		assert.equal(extractNormalizedExtension('/alice/files/README'), 'other')
		assert.equal(extractNormalizedExtension('/alice/files/trailing.'), 'other')
		assert.equal(extractNormalizedExtension(''), 'other')
		assert.equal(extractNormalizedExtension(null), 'other')

		assert.equal(getDuplicateExtension({
			files: [
				{ path: '/u/files/a.PDF', size: 100 },
				{ path: '/u/files/b.pdf', size: 100 },
			],
		}), '.pdf')
		assert.equal(getDuplicateExtension({
			files: [
				{ path: '/u/files/Makefile', size: 100 },
				{ path: '/u/files/Makefile.bak', size: 100 },
			],
		}), '.bak')
		assert.equal(getDuplicateExtension({ count: 2, size: 500, path: '/u/files/LICENSE' }), 'other')
		assert.equal(getDuplicateExtension(null), 'other')

		const jpgGroup = { files: [{ path: '/u/a.JPG', size: 10 }, { path: '/u/b.jpg', size: 10 }] }
		assert.equal(matchesDuplicateExtension(jpgGroup, '.jpg'), true)
		assert.equal(matchesDuplicateExtension(jpgGroup, 'JPG'), true)
		assert.equal(matchesDuplicateExtension(jpgGroup, '.png'), false)
		assert.equal(matchesDuplicateExtension(jpgGroup, ''), true)
	})

	test('computeExtensionBreakdown aggregates (count - 1) * size, sorts descending, and respects Top-N limit', () => {
		const { computeExtensionBreakdown } = loadModule('src/tools/duplicateStats.js')

		assert.deepEqual(computeExtensionBreakdown([]), [])
		assert.deepEqual(computeExtensionBreakdown(null), [])
		assert.deepEqual(computeExtensionBreakdown([{ id: 1, files: [{ path: '/u/a.jpg', size: 1024 }] }]), [])
		assert.deepEqual(computeExtensionBreakdown([{ id: 1, count: 1, size: 1024, path: '/u/a.jpg' }]), [])

		const MB = 1024 * 1024
		const groups = [
			// .mp4: (2 - 1) * 10 MB = 10 MB
			{
				id: 1,
				files: [
					{ path: '/u/v1.MP4', size: 10 * MB },
					{ path: '/u/v2.mp4', size: 10 * MB },
				],
			},
			// .jpg group A: (3 - 1) * 2 MB = 4 MB
			{
				id: 2,
				files: [
					{ path: '/u/p1.JPG', size: 2 * MB },
					{ path: '/u/p2.jpg', size: 2 * MB },
					{ path: '/u/p3.jpg', size: 2 * MB },
				],
			},
			// .jpg group B: (2 - 1) * 2 MB = 2 MB -> total .jpg = 6 MB across 2 groups
			{
				id: 3,
				files: [
					{ path: '/u/q1.jpg', size: 2 * MB },
					{ path: '/u/q2.jpg', size: 2 * MB },
				],
			},
			// other (extensionless): (3 - 1) * 1 MB = 2 MB
			{
				id: 4,
				files: [
					{ path: '/u/README', size: MB },
					{ path: '/u/backup/README', size: MB },
					{ path: '/u/old/README', size: MB },
				],
			},
			// .pdf: (2 - 1) * 1 MB = 1 MB
			{
				id: 5,
				files: [
					{ path: '/u/doc1.pdf', size: MB },
					{ path: '/u/doc2.pdf', size: MB },
				],
			},
			// singleton should be ignored
			{
				id: 6,
				files: [{ path: '/u/huge.iso', size: 100 * MB }],
			},
		]

		// Total reclaimable across valid groups = 10 + 6 + 2 + 1 = 19 MB
		const top3 = computeExtensionBreakdown(groups)
		assert.equal(top3.length, 3)
		assert.deepEqual(top3, [
			{
				ext: '.mp4',
				reclaimableBytes: 10 * MB,
				reclaimableFormatted: '10 MB',
				groupCount: 1,
				sharePct: 53,
			},
			{
				ext: '.jpg',
				reclaimableBytes: 6 * MB,
				reclaimableFormatted: '6 MB',
				groupCount: 2,
				sharePct: 32,
			},
			{
				ext: 'other',
				reclaimableBytes: 2 * MB,
				reclaimableFormatted: '2 MB',
				groupCount: 1,
				sharePct: 11,
			},
		])

		assert.equal(computeExtensionBreakdown(groups, 0).length, 0)
		assert.equal(computeExtensionBreakdown(groups, 4).length, 4)

		// Zero-byte valid duplicate groups yield 0 B and 0% share safely
		assert.deepEqual(computeExtensionBreakdown([
			{ id: 9, files: [{ path: '/u/empty1.txt', size: 0 }, { path: '/u/empty2.txt', size: 0 }] },
		]), [
			{
				ext: '.txt',
				reclaimableBytes: 0,
				reclaimableFormatted: '0 B',
				groupCount: 1,
				sharePct: 0,
			},
		])
	})

	test('findLargestDuplicateGroup returns the group with highest reclaimable bytes or null when empty', () => {
		const { findLargestDuplicateGroup } = loadModule('src/tools/duplicateStats.js')

		assert.equal(findLargestDuplicateGroup([]), null)
		assert.equal(findLargestDuplicateGroup(null), null)
		assert.equal(findLargestDuplicateGroup([{ id: 1, files: [{ path: '/u/only.iso', size: 999999 }] }]), null)

		const MB = 1024 * 1024
		const twoCopyLargeFile = {
			id: 10,
			files: [
				{ path: '/u/a.iso', size: 10 * MB },
				{ path: '/u/b.iso', size: 10 * MB },
			],
		} // reclaimable: 10 MB
		const fourCopyMediumFile = {
			id: 20,
			files: [
				{ path: '/u/1.mp4', size: 4 * MB },
				{ path: '/u/2.mp4', size: 4 * MB },
				{ path: '/u/3.mp4', size: 4 * MB },
				{ path: '/u/4.mp4', size: 4 * MB },
			],
		} // reclaimable: 12 MB (largest reclaimable even though unit size is smaller)

		const largest = findLargestDuplicateGroup([twoCopyLargeFile, fourCopyMediumFile])
		assert.equal(largest.id, 20)
	})

	test('DuplicateNavigation renders Top-3 extension insights, toggles extension filter, and jumps to largest group', async () => {
		window.localStorage.clear()
		const DuplicateNavigation = createNavigationComponent()
		const MB = 1024 * 1024

		const opened = []
		const vm = new Vue({
			render(h) {
				return h(DuplicateNavigation, {
					ref: 'nav',
					props: {
						acknowledgedDuplicates: [
							{
								id: 100,
								hash: 'ack-pdf',
								files: [
									{ id: 1, path: '/u/files/doc1.pdf', mimetype: 'application/pdf', size: MB },
									{ id: 2, path: '/u/files/doc2.pdf', mimetype: 'application/pdf', size: MB },
								],
							},
						],
						unacknowledgedDuplicates: [
							{
								id: 1,
								hash: 'unack-mp4',
								files: [
									{ id: 11, path: '/u/files/clip1.mp4', mimetype: 'video/mp4', size: 8 * MB },
									{ id: 12, path: '/u/files/clip2.mp4', mimetype: 'video/mp4', size: 8 * MB },
								],
							},
							{
								id: 2,
								hash: 'unack-jpg',
								files: [
									{ id: 21, path: '/u/files/img1.jpg', mimetype: 'image/jpeg', size: 2 * MB },
									{ id: 22, path: '/u/files/img2.jpg', mimetype: 'image/jpeg', size: 2 * MB },
									{ id: 23, path: '/u/files/img3.jpg', mimetype: 'image/jpeg', size: 2 * MB },
								],
							},
							{
								id: 3,
								hash: 'unack-other',
								files: [
									{ id: 31, path: '/u/files/README', mimetype: 'text/plain', size: 512 * 1024 },
									{ id: 32, path: '/u/files/old/README', mimetype: 'text/plain', size: 512 * 1024 },
								],
							},
						],
					},
					on: {
						'open-duplicate': dup => opened.push(dup),
					},
				})
			},
		}).$mount()
		await settle()

		const nav = vm.$refs.nav
		// Hidden in clean default normal mode
		assert.equal(nav.uiLevel, 'normal')
		assert.equal(vm.$el.querySelector('.extension-insights-bar'), null, 'extension insights bar is hidden in normal mode')

		// Switch to advanced mode to inspect Top-3 extension insights and largest jump button
		nav.setUiLevel('advanced')
		await settle()

		const bar = vm.$el.querySelector('.extension-insights-bar')
		assert.ok(bar, 'extension insights bar is rendered in advanced mode when duplicates exist')

		const extChips = Array.from(vm.$el.querySelectorAll('button.extension-insight-chip'))
		assert.equal(extChips.length, 3, 'renders Top-3 extensions only')
		assert.ok(extChips[0].textContent.includes('.mp4'))
		assert.ok(extChips[0].textContent.includes('8 MB'))
		assert.ok(extChips[1].textContent.includes('.jpg'))
		assert.ok(extChips[1].textContent.includes('4 MB'))
		assert.ok(extChips[2].textContent.includes('.pdf'))
		assert.ok(extChips[2].textContent.includes('1 MB'))
		assert.equal(extChips[0].getAttribute('aria-pressed'), 'false')

		// Click Largest jump button -> opens id 1 (.mp4, 8 MB reclaimable)
		const jumpBtn = vm.$el.querySelector('button.largest-group-jump-button')
		assert.ok(jumpBtn, 'largest group jump button is rendered')
		assert.ok(jumpBtn.textContent.includes('8 MB'))
		jumpBtn.click()
		await settle()
		assert.equal(opened.length, 1)
		assert.equal(opened[0].id, 1)

		// Click .jpg chip -> filters to .jpg group only and shows Reset filters
		extChips[1].click()
		await settle()
		assert.equal(nav.selectedExtension, '.jpg')
		assert.equal(extChips[1].getAttribute('aria-pressed'), 'true')
		assert.equal(nav.filteredUnacknowledgedDuplicates.length, 1)
		assert.equal(nav.filteredUnacknowledgedDuplicates[0].id, 2)
		assert.equal(nav.filteredAcknowledgedDuplicates.length, 0)
		assert.ok(vm.$el.querySelector('button.reset-filters-button'), 'Reset filters button appears when extension filter is active')
		assert.ok(jumpBtn.textContent.includes('4 MB'), 'Largest jump updates to active filtered set')

		// Click .jpg chip again -> toggles off extension filter
		extChips[1].click()
		await settle()
		assert.equal(nav.selectedExtension, '')
		assert.equal(nav.filteredUnacknowledgedDuplicates.length, 3)
		assert.equal(nav.filteredAcknowledgedDuplicates.length, 1)

		// Activate .pdf chip then click Reset filters
		extChips[2].click()
		await settle()
		assert.equal(nav.filteredAcknowledgedDuplicates.length, 1)
		assert.equal(nav.filteredUnacknowledgedDuplicates.length, 0)
		vm.$el.querySelector('button.reset-filters-button').click()
		await settle()
		assert.equal(nav.selectedExtension, '')
		assert.equal(nav.filteredUnacknowledgedDuplicates.length, 3)

		vm.$destroy()
		window.localStorage.clear()
	})

	test('DuplicateNavigation hides insights bar when empty and adheres to logical CSS, 44px targets, focus-visible, and zero XSS/dashes', async () => {
		const DuplicateNavigation = createNavigationComponent()
		const emptyVm = new Vue({
			render(h) {
				return h(DuplicateNavigation, {
					props: {
						acknowledgedDuplicates: [],
						unacknowledgedDuplicates: [],
					},
				})
			},
		}).$mount()
		await settle()
		assert.equal(emptyVm.$el.querySelector('.extension-insights-bar'), null)
		emptyVm.$destroy()

		const statsSource = readFileSync(resolve(root, 'src/tools/duplicateStats.js'), 'utf8')
		const navSource = readFileSync(resolve(root, 'src/components/DuplicateNavigation.vue'), 'utf8')
		assert.ok(!/[\u2013\u2014]/.test(statsSource))
		assert.ok(!/[\u2013\u2014]/.test(navSource))
		assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(statsSource))
		assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(navSource))

		const filterCssStart = navSource.indexOf('/* Quick File-Type Filter Chips & Live Reclaimable Summary */')
		const filterCssBlock = navSource.slice(filterCssStart, navSource.indexOf('/* Consistent highlighting'))
		assert.ok(filterCssBlock.includes('.extension-insight-chip:focus-visible'))
		assert.ok(filterCssBlock.includes('.largest-group-jump-button:focus-visible'))
		assert.ok(filterCssBlock.includes('min-inline-size: 44px'))
		assert.ok(filterCssBlock.includes('min-block-size: 44px'))
		assert.ok(!/(?:margin|padding|border)-(?:left|right|top|bottom)/.test(filterCssBlock))
	})
})
