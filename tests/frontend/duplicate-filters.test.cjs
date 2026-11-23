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
		'@/tools/duplicatePreferences': loadModule('src/tools/duplicatePreferences.js'),
		'@/tools/duplicateSelectionAndExport': loadModule('src/tools/duplicateSelectionAndExport.js'),
		'@/tools/duplicateSortHelper': loadModule('src/tools/duplicateSortHelper.js'),
		'@/tools/duplicateStats': loadModule('src/tools/duplicateStats.js'),
	})
}

describe('Cycle 37: duplicate file-type filters & reclaimable space summary', () => {
	test('classifyFileCategory classifies MIME types and file extensions accurately', () => {
		const { classifyFileCategory, extractFileExtension } = loadModule('src/tools/duplicateFilters.js')

		assert.equal(extractFileExtension('/alice/files/Photos/IMG_001.JPG'), 'jpg')
		assert.equal(extractFileExtension('/alice/files/.hidden'), '')
		assert.equal(extractFileExtension(''), '')

		assert.equal(classifyFileCategory({ mimetype: 'image/jpeg', path: '/u/files/a.bin' }), 'images')
		assert.equal(classifyFileCategory({ path: '/u/files/holiday.HEIC' }), 'images')
		assert.equal(classifyFileCategory({ mimetype: 'video/mp4', path: '/u/files/clip' }), 'videos')
		assert.equal(classifyFileCategory({ path: '/u/files/movie.mkv' }), 'videos')
		assert.equal(classifyFileCategory({ mimetype: 'audio/flac', path: '/u/files/track' }), 'audio')
		assert.equal(classifyFileCategory({ path: '/u/files/podcast.mp3' }), 'audio')
		assert.equal(classifyFileCategory({ mimetype: 'application/pdf', path: '/u/files/report' }), 'documents')
		assert.equal(classifyFileCategory({ mimetype: 'application/epub+zip', path: '/u/files/book.epub' }), 'documents')
		assert.equal(classifyFileCategory({ mimetype: 'text/plain; charset=utf-8', path: '/u/files/notes' }), 'documents')
		assert.equal(classifyFileCategory({ path: '/u/files/sheet.xlsx' }), 'documents')
		assert.equal(classifyFileCategory({ mimetype: 'application/zip', path: '/u/files/backup.zip' }), 'archives')
		assert.equal(classifyFileCategory({ mimetype: 'application/octet-stream', path: '/u/files/bundle.7z' }), 'archives')
		assert.equal(classifyFileCategory({ path: '/u/files/unknown.xyz' }), 'other')
		assert.equal(classifyFileCategory(null), 'other')
	})

	test('filterDuplicatesByCategory handles all categories and strict > 10 MB boundary', () => {
		const {
			LARGE_FILE_THRESHOLD_BYTES,
			filterDuplicatesByCategory,
			isLargeFile,
		} = loadModule('src/tools/duplicateFilters.js')

		assert.equal(LARGE_FILE_THRESHOLD_BYTES, 10 * 1024 * 1024)
		assert.equal(isLargeFile({ size: LARGE_FILE_THRESHOLD_BYTES }), false)
		assert.equal(isLargeFile({ size: LARGE_FILE_THRESHOLD_BYTES + 1 }), true)

		const groups = [
			{ id: 1, files: [{ path: '/u/files/a.png', mimetype: 'image/png', size: 2048 }, { path: '/u/files/b.png', mimetype: 'image/png', size: 2048 }] },
			{ id: 2, files: [{ path: '/u/files/a.mp4', mimetype: 'video/mp4', size: 10 * 1024 * 1024 }, { path: '/u/files/b.mp4', mimetype: 'video/mp4', size: 10 * 1024 * 1024 }] },
			{ id: 3, files: [{ path: '/u/files/a.mp3', size: 1024 }, { path: '/u/files/b.mp3', size: 1024 }] },
			{ id: 4, files: [{ path: '/u/files/a.pdf', size: 5000 }, { path: '/u/files/b.pdf', size: 5000 }] },
			{ id: 5, files: [{ path: '/u/files/a.tar.gz', size: 12 * 1024 * 1024 }, { path: '/u/files/b.tar.gz', size: 12 * 1024 * 1024 }] },
		]

		assert.equal(filterDuplicatesByCategory(groups, 'all').length, 5)
		assert.deepEqual(filterDuplicatesByCategory(groups, 'images').map(g => g.id), [1])
		assert.deepEqual(filterDuplicatesByCategory(groups, 'videos').map(g => g.id), [2])
		assert.deepEqual(filterDuplicatesByCategory(groups, 'audio').map(g => g.id), [3])
		assert.deepEqual(filterDuplicatesByCategory(groups, 'documents').map(g => g.id), [4])
		assert.deepEqual(filterDuplicatesByCategory(groups, 'archives').map(g => g.id), [5])
		assert.deepEqual(filterDuplicatesByCategory(groups, 'large').map(g => g.id), [5])
		assert.deepEqual(filterDuplicatesByCategory(null, 'images'), [])
	})

	test('computeReclaimableSummary sums (count - 1) * size and handles edge cases (0 size, count <= 1, empty list)', () => {
		const { computeReclaimableSummary, formatBytes } = loadModule('src/tools/duplicateFilters.js')

		assert.equal(formatBytes(0), '0 B')
		assert.equal(formatBytes(-50), '0 B')
		assert.equal(formatBytes(512), '512 B')
		assert.equal(formatBytes(1024), '1 KB')
		assert.equal(formatBytes(1536), '1.5 KB')
		assert.equal(formatBytes(1023.98 * 1024), '1 MB')
		assert.equal(formatBytes(2.5 * 1024 * 1024), '2.5 MB')
		assert.equal(formatBytes(2 * 1024 * 1024 * 1024), '2 GB')

		// Empty list and null/undefined
		assert.deepEqual(computeReclaimableSummary([]), {
			bytes: 0,
			formatted: '0 B',
			groupCount: 0,
			redundantCopies: 0,
		})
		assert.deepEqual(computeReclaimableSummary(null), {
			bytes: 0,
			formatted: '0 B',
			groupCount: 0,
			redundantCopies: 0,
		})

		// count <= 1 never produces negative or bogus reclaimable bytes
		assert.deepEqual(computeReclaimableSummary([
			{ id: 1, files: [] },
			{ id: 2, files: [{ size: 4096 }] },
			{ id: 3, count: 1, size: 4096 },
			{ id: 4, count: 0, size: 4096 },
		]), {
			bytes: 0,
			formatted: '0 B',
			groupCount: 0,
			redundantCopies: 0,
		})

		// Zero-byte duplicate files count as a group + redundant copies with 0 B reclaimable
		assert.deepEqual(computeReclaimableSummary([
			{ id: 1, files: [{ size: 0 }, { size: 0 }, { size: 0 }] },
		]), {
			bytes: 0,
			formatted: '0 B',
			groupCount: 1,
			redundantCopies: 2,
		})

		// Multi-group sum: (3 - 1) * 2 MB + (2 - 1) * 512 KB = 4.5 MB
		const twoMb = 2 * 1024 * 1024
		const halfMb = 512 * 1024
		assert.deepEqual(computeReclaimableSummary([
			{ id: 10, files: [{ size: twoMb }, { size: twoMb }, { size: twoMb }] },
			{ id: 11, files: [{ size: halfMb }, { size: halfMb }] },
		]), {
			bytes: (2 * twoMb) + halfMb,
			formatted: '4.5 MB',
			groupCount: 2,
			redundantCopies: 3,
		})
	})

	test('DuplicateNavigation renders quick filter chips, aria-pressed states, and live reclaimable summary badge', async () => {
		const DuplicateNavigation = createNavigationComponent()
		const twoMb = 2 * 1024 * 1024
		const fifteenMb = 15 * 1024 * 1024

		const vm = new Vue({
			render(h) {
				return h(DuplicateNavigation, {
					ref: 'nav',
					props: {
						acknowledgedDuplicates: [
							{
								id: 100,
								hash: 'ack-doc',
								files: [
									{ id: 1, path: '/u/files/a.pdf', mimetype: 'application/pdf', size: 1024 },
									{ id: 2, path: '/u/files/b.pdf', mimetype: 'application/pdf', size: 1024 },
								],
							},
						],
						unacknowledgedDuplicates: [
							{
								id: 1,
								hash: 'img-dup',
								files: [
									{ id: 11, path: '/u/files/photo1.jpg', mimetype: 'image/jpeg', size: twoMb },
									{ id: 12, path: '/u/files/photo2.jpg', mimetype: 'image/jpeg', size: twoMb },
									{ id: 13, path: '/u/files/photo3.jpg', mimetype: 'image/jpeg', size: twoMb },
								],
							},
							{
								id: 2,
								hash: 'archive-dup',
								files: [
									{ id: 21, path: '/u/files/backup1.zip', mimetype: 'application/zip', size: fifteenMb },
									{ id: 22, path: '/u/files/backup2.zip', mimetype: 'application/zip', size: fifteenMb },
								],
							},
						],
					},
				})
			},
		}).$mount()
		await settle()

		const nav = vm.$refs.nav
		const chips = Array.from(vm.$el.querySelectorAll('button.filter-chip'))
		assert.equal(chips.length, 7)
		assert.equal(chips[0].getAttribute('aria-pressed'), 'true')
		assert.equal(chips[1].getAttribute('aria-pressed'), 'false')

		const badge = vm.$el.querySelector('.reclaimable-summary-badge')
		assert.ok(badge, 'reclaimable summary badge is rendered')
		assert.equal(badge.getAttribute('role'), 'status')
		assert.equal(badge.getAttribute('aria-live'), 'polite')
		// Total initially: 4 MB (images) + 15 MB (archive) + 1 KB (pdf) = 19 MB
		assert.ok(badge.textContent.includes('19 MB'), `expected 19 MB in "${badge.textContent}"`)

		// Click Images chip (index 1)
		chips[1].click()
		await settle()
		assert.equal(nav.selectedCategory, 'images')
		assert.equal(chips[0].getAttribute('aria-pressed'), 'false')
		assert.equal(chips[1].getAttribute('aria-pressed'), 'true')
		assert.equal(nav.filteredUnacknowledgedDuplicates.length, 1)
		assert.equal(nav.filteredUnacknowledgedDuplicates[0].id, 1)
		assert.equal(nav.filteredAcknowledgedDuplicates.length, 0)
		assert.ok(badge.textContent.includes('4 MB'), `expected 4 MB in "${badge.textContent}"`)
		assert.ok(badge.textContent.includes('1 groups, 2 extra'))

		// Click > 10 MB chip (index 6)
		chips[6].click()
		await settle()
		assert.equal(nav.selectedCategory, 'large')
		assert.equal(nav.filteredUnacknowledgedDuplicates.length, 1)
		assert.equal(nav.filteredUnacknowledgedDuplicates[0].id, 2)
		assert.ok(badge.textContent.includes('15 MB'), `expected 15 MB in "${badge.textContent}"`)

		// Click Videos chip (index 2) -> empty results show 0 B
		chips[2].click()
		await settle()
		assert.equal(nav.filteredUnacknowledgedDuplicates.length, 0)
		assert.ok(badge.textContent.includes('0 B'), `expected 0 B in "${badge.textContent}"`)

		// Click All chip (index 0) -> restores all groups
		chips[0].click()
		await settle()
		assert.equal(nav.filteredUnacknowledgedDuplicates.length, 2)
		assert.equal(nav.filteredAcknowledgedDuplicates.length, 1)

		vm.$destroy()
	})

	test('DuplicateNavigation quick filter panel enforces 44px touch targets, focus-visible, and logical CSS', () => {
		const navSource = readFileSync(resolve(root, 'src/components/DuplicateNavigation.vue'), 'utf8')
		const filterCssStart = navSource.indexOf('/* Quick File-Type Filter Chips & Live Reclaimable Summary */')
		assert.ok(filterCssStart !== -1, 'quick filter CSS block exists')
		const filterCssBlock = navSource.slice(filterCssStart, navSource.indexOf('/* Consistent highlighting'))

		assert.ok(filterCssBlock.includes('min-inline-size: 44px'))
		assert.ok(filterCssBlock.includes('min-block-size: 44px'))
		assert.ok(filterCssBlock.includes('flex-wrap: wrap'))
		assert.ok(filterCssBlock.includes('.filter-chip-count'))
		assert.ok(navSource.includes('.filter-chip:focus-visible'))
		assert.ok(!/(?:margin|padding|border)-(?:left|right|top|bottom)/.test(filterCssBlock), 'new CSS must use logical properties only')
	})
})

describe('Cycle 62: computeCategoryCounts & live chip counts in DuplicateNavigation', () => {
	test('computeCategoryCounts returns zeroed counts for empty, null, or malformed inputs', () => {
		const { computeCategoryCounts } = loadModule('src/tools/duplicateFilters.js')

		const zeroCounts = {
			all: 0,
			images: 0,
			videos: 0,
			audio: 0,
			documents: 0,
			archives: 0,
			large: 0,
		}

		assert.deepEqual(computeCategoryCounts([]), zeroCounts)
		assert.deepEqual(computeCategoryCounts(null), zeroCounts)
		assert.deepEqual(computeCategoryCounts(undefined), zeroCounts)
		assert.deepEqual(computeCategoryCounts([null, undefined, 'invalid']), zeroCounts)
		assert.deepEqual(computeCategoryCounts([{ id: 1, files: [] }]), {
			...zeroCounts,
			all: 1,
		})
	})

	test('computeCategoryCounts counts multi-extension files and > 10 MB groups accurately without double-counting', () => {
		const {
			LARGE_FILE_THRESHOLD_BYTES,
			computeCategoryCounts,
		} = loadModule('src/tools/duplicateFilters.js')

		const groups = [
			{
				id: 1,
				files: [
					{ path: '/u/files/holiday.backup.JPG', size: 2048 },
					{ path: '/u/files/holiday.copy.png', size: 2048 },
				],
			},
			{
				id: 2,
				files: [
					{ path: '/u/files/clip.v1.mp4', size: LARGE_FILE_THRESHOLD_BYTES },
					{ path: '/u/files/clip.v2.mkv', size: LARGE_FILE_THRESHOLD_BYTES },
				],
			},
			{
				id: 3,
				files: [
					{ path: '/u/files/podcast.2026.mp3', size: 1024 },
					{ path: '/u/files/podcast.edit.flac', size: 1024 },
				],
			},
			{
				id: 4,
				files: [
					{ path: '/u/files/spec.final.v2.pdf', size: 5000 },
					{ path: '/u/files/spec.draft.docx', size: 5000 },
				],
			},
			{
				id: 5,
				files: [
					{ path: '/u/files/db.dump.tar.gz', size: LARGE_FILE_THRESHOLD_BYTES + 1 },
					{ path: '/u/files/db.mirror.tar.bz2', size: LARGE_FILE_THRESHOLD_BYTES + 1 },
				],
			},
			{
				id: 6,
				files: [
					{ path: '/u/files/mixed.preview.jpg', size: 12 * 1024 * 1024 },
					{ path: '/u/files/mixed.notes.md', size: 12 * 1024 * 1024 },
				],
			},
			{
				id: 7,
				files: [
					{ path: '/u/files/blob.unknown', size: 512 },
					{ path: '/u/files/blob2.unknown', size: 512 },
				],
			},
		]

		assert.deepEqual(computeCategoryCounts(groups), {
			all: 7,
			images: 2,
			videos: 1,
			audio: 1,
			documents: 2,
			archives: 1,
			large: 2,
		})
	})

	test('DuplicateNavigation renders live (N) category counts and updates them reactively', async () => {
		const DuplicateNavigation = createNavigationComponent()
		const twoMb = 2 * 1024 * 1024
		const fifteenMb = 15 * 1024 * 1024

		const vm = new Vue({
			render(h) {
				return h(DuplicateNavigation, {
					ref: 'nav',
					props: {
						acknowledgedDuplicates: [
							{
								id: 100,
								hash: 'ack-doc',
								files: [
									{ id: 1, path: '/Photos/a.pdf', mimetype: 'application/pdf', size: 1024 },
									{ id: 2, path: '/Backups/b.pdf', mimetype: 'application/pdf', size: 1024 },
								],
							},
						],
						unacknowledgedDuplicates: [
							{
								id: 1,
								hash: 'img-dup',
								files: [
									{ id: 11, path: '/Photos/photo1.backup.jpg', mimetype: 'image/jpeg', size: twoMb },
									{ id: 12, path: '/Photos/photo2.jpg', mimetype: 'image/jpeg', size: twoMb },
								],
							},
							{
								id: 2,
								hash: 'archive-dup',
								files: [
									{ id: 21, path: '/Backups/backup1.tar.gz', mimetype: 'application/gzip', size: fifteenMb },
									{ id: 22, path: '/Backups/backup2.tar.gz', mimetype: 'application/gzip', size: fifteenMb },
								],
							},
						],
					},
				})
			},
		}).$mount()
		await settle()

		const nav = vm.$refs.nav
		const readChipTexts = () => Array.from(vm.$el.querySelectorAll('button.filter-chip'))
			.map(btn => btn.textContent.replace(/\s+/g, ' ').trim())

		assert.deepEqual(readChipTexts(), [
			'All (3)',
			'Images (1)',
			'Videos (0)',
			'Audio (0)',
			'Documents (1)',
			'Archives (1)',
			'> 10 MB (1)',
		])

		// Selecting a category keeps all category chip counts intact for quick switching
		const chips = Array.from(vm.$el.querySelectorAll('button.filter-chip'))
		chips[1].click()
		await settle()
		assert.equal(nav.selectedCategory, 'images')
		assert.deepEqual(readChipTexts(), [
			'All (3)',
			'Images (1)',
			'Videos (0)',
			'Audio (0)',
			'Documents (1)',
			'Archives (1)',
			'> 10 MB (1)',
		])

		// Applying a folder prefix filter updates chip counts live
		nav.folderQuery = '/Backups'
		await settle()
		assert.deepEqual(readChipTexts(), [
			'All (2)',
			'Images (0)',
			'Videos (0)',
			'Audio (0)',
			'Documents (1)',
			'Archives (1)',
			'> 10 MB (1)',
		])

		// Applying minSizeBytes updates chip counts live
		nav.folderQuery = ''
		nav.setMinSizeBytes(10 * 1024 * 1024)
		await settle()
		assert.deepEqual(readChipTexts(), [
			'All (1)',
			'Images (0)',
			'Videos (0)',
			'Audio (0)',
			'Documents (0)',
			'Archives (1)',
			'> 10 MB (1)',
		])

		const filtersSource = readFileSync(resolve(root, 'src/tools/duplicateFilters.js'), 'utf8')
		const navSource = readFileSync(resolve(root, 'src/components/DuplicateNavigation.vue'), 'utf8')
		for (const content of [filtersSource, navSource]) {
			assert.ok(!/[\u2013\u2014]/.test(content), 'no U+2013/U+2014 dashes allowed')
			assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(content), 'no DOM XSS sinks allowed')
		}

		vm.$destroy()
	})
})

describe('Cycle 65: MIN_SIZE_PRESETS, filterDuplicatesByMinSize, and accessible minimum size selector', () => {
	test('MIN_SIZE_PRESETS exposes frozen byte thresholds and filterDuplicatesByMinSize filters purely without mutation', () => {
		const { MIN_SIZE_PRESETS, filterDuplicatesByMinSize } = loadModule('src/tools/duplicateFilters.js')

		assert.deepEqual(MIN_SIZE_PRESETS, {
			any: 0,
			'1mb': 1048576,
			'10mb': 10485760,
			'100mb': 104857600,
		})
		assert.equal(Object.isFrozen(MIN_SIZE_PRESETS), true)

		const smallGroup = Object.freeze({
			id: 1,
			files: Object.freeze([
				Object.freeze({ path: '/u/files/small.txt', size: 1048575 }),
			]),
		})
		const exactOneMbGroup = Object.freeze({
			id: 2,
			files: Object.freeze([
				Object.freeze({ path: '/u/files/one-mb.png', size: 1048576 }),
			]),
		})
		const exactTenMbGroup = Object.freeze({
			id: 3,
			files: Object.freeze([
				Object.freeze({ path: '/u/files/ten-mb.mp4', size: 10485760 }),
			]),
		})
		const hundredMbGroup = Object.freeze({
			id: 4,
			files: Object.freeze([
				Object.freeze({ path: '/u/files/archive.tar.gz', size: 104857600 }),
			]),
		})
		const invalidSizeGroup = Object.freeze({
			id: 5,
			files: Object.freeze([
				Object.freeze({ path: '/u/files/broken.bin', size: null }),
				Object.freeze({ path: '/u/files/empty.bin', size: '' }),
			]),
		})
		const groupSizeFallback = Object.freeze({
			id: 6,
			size: 15 * 1024 * 1024,
		})

		const frozenInput = Object.freeze([
			smallGroup,
			exactOneMbGroup,
			exactTenMbGroup,
			hundredMbGroup,
			invalidSizeGroup,
			groupSizeFallback,
		])

		const anyResult = filterDuplicatesByMinSize(frozenInput, 'any')
		assert.notEqual(anyResult, frozenInput)
		assert.deepEqual(anyResult.map(g => g.id), [1, 2, 3, 4, 5, 6])

		assert.deepEqual(filterDuplicatesByMinSize(frozenInput, '1mb').map(g => g.id), [2, 3, 4, 6])
		assert.deepEqual(filterDuplicatesByMinSize(frozenInput, '10mb').map(g => g.id), [3, 4, 6])
		assert.deepEqual(filterDuplicatesByMinSize(frozenInput, '100mb').map(g => g.id), [4])

		// Unknown, null, undefined presets fall back to 'any'; non-array input returns []
		assert.deepEqual(filterDuplicatesByMinSize(frozenInput, 'unknown').map(g => g.id), [1, 2, 3, 4, 5, 6])
		assert.deepEqual(filterDuplicatesByMinSize(frozenInput, null).map(g => g.id), [1, 2, 3, 4, 5, 6])
		assert.deepEqual(filterDuplicatesByMinSize(undefined, '10mb'), [])
		assert.deepEqual(filterDuplicatesByMinSize(null, '10mb'), [])
	})

	test('DuplicateNavigation renders accessible minimum size select, filters duplicates, and resets via Reset filters', async () => {
		window.localStorage.clear()
		const DuplicateNavigation = createNavigationComponent()
		const emittedQueryChanges = []
		const twoHundredKb = 200 * 1024
		const twoMb = 2 * 1024 * 1024
		const fifteenMb = 15 * 1024 * 1024
		const oneTwentyMb = 120 * 1024 * 1024

		const vm = new Vue({
			render(h) {
				return h(DuplicateNavigation, {
					ref: 'nav',
					props: {
						acknowledgedDuplicates: [
							{
								id: 100,
								hash: 'ack-big',
								files: [
									{ id: 1, path: '/u/files/ack-video.mp4', mimetype: 'video/mp4', size: fifteenMb },
									{ id: 2, path: '/u/files/ack-video-copy.mp4', mimetype: 'video/mp4', size: fifteenMb },
								],
							},
						],
						unacknowledgedDuplicates: [
							{
								id: 1,
								hash: 'small-doc',
								files: [
									{ id: 11, path: '/u/files/note.pdf', mimetype: 'application/pdf', size: twoHundredKb },
									{ id: 12, path: '/u/files/note-copy.pdf', mimetype: 'application/pdf', size: twoHundredKb },
								],
							},
							{
								id: 2,
								hash: 'mid-img',
								files: [
									{ id: 21, path: '/u/files/img.jpg', mimetype: 'image/jpeg', size: twoMb },
									{ id: 22, path: '/u/files/img-copy.jpg', mimetype: 'image/jpeg', size: twoMb },
								],
							},
							{
								id: 3,
								hash: 'huge-iso',
								files: [
									{ id: 31, path: '/u/files/distro.zip', mimetype: 'application/zip', size: oneTwentyMb },
									{ id: 32, path: '/u/files/distro-copy.zip', mimetype: 'application/zip', size: oneTwentyMb },
								],
							},
						],
					},
					on: {
						'query-options-changed': payload => emittedQueryChanges.push(payload),
					},
				})
			},
		}).$mount()
		await settle()

		const nav = vm.$refs.nav
		const select = vm.$el.querySelector('select.min-size-filter-select')
		const label = vm.$el.querySelector('label.min-size-filter-label')
		assert.ok(select, 'minimum size select is rendered')
		assert.ok(label, 'minimum size label is rendered')
		assert.equal(label.getAttribute('for'), select.getAttribute('id'))
		assert.ok(select.getAttribute('aria-label'))
		assert.equal(select.value, 'any')
		assert.deepEqual(
			Array.from(select.querySelectorAll('option')).map(o => o.value),
			['any', '1mb', '10mb', '100mb'],
		)

		// Change to >= 10 MB via DOM select event
		select.value = '10mb'
		select.dispatchEvent(new window.Event('change'))
		await settle()

		assert.equal(nav.selectedMinSizePreset, '10mb')
		assert.equal(nav.minSizeBytes, 10485760)
		assert.deepEqual(nav.filteredUnacknowledgedDuplicates.map(d => d.id), [3])
		assert.deepEqual(nav.filteredAcknowledgedDuplicates.map(d => d.id), [100])
		assert.deepEqual(emittedQueryChanges[emittedQueryChanges.length - 1], {
			sortBy: 'none',
			minSize: 10485760,
		})

		// Reset filters button is visible and resets select back to 'any'
		const resetBtn = vm.$el.querySelector('button.reset-filters-button')
		assert.ok(resetBtn, 'Reset filters button appears when minSize preset is active')
		resetBtn.click()
		await settle()

		assert.equal(nav.minSizeBytes, 0)
		assert.equal(nav.selectedMinSizePreset, 'any')
		assert.equal(select.value, 'any')
		assert.deepEqual(nav.filteredUnacknowledgedDuplicates.map(d => d.id), [1, 2, 3])
		assert.deepEqual(emittedQueryChanges[emittedQueryChanges.length - 1], {
			sortBy: 'none',
			minSize: 0,
		})

		vm.$destroy()
	})

	test('DuplicateNavigation reflects custom initialMinSizeBytes cleanly in select and resets to any', async () => {
		window.localStorage.clear()
		const DuplicateNavigation = createNavigationComponent()
		const fiveMb = 5 * 1024 * 1024

		const vm = new Vue({
			render(h) {
				return h(DuplicateNavigation, {
					ref: 'nav',
					props: {
						acknowledgedDuplicates: [],
						unacknowledgedDuplicates: [
							{
								id: 1,
								hash: 'small',
								files: [{ id: 1, path: '/u/files/a.txt', size: 1024 }],
							},
							{
								id: 2,
								hash: 'six-mb',
								files: [{ id: 2, path: '/u/files/b.zip', size: 6 * 1024 * 1024 }],
							},
						],
						initialMinSizeBytes: fiveMb,
					},
				})
			},
		}).$mount()
		await settle()

		const select = vm.$el.querySelector('select.min-size-filter-select')
		assert.equal(vm.$refs.nav.selectedMinSizePreset, 'custom')
		assert.equal(select.value, 'custom')
		assert.deepEqual(vm.$refs.nav.filteredUnacknowledgedDuplicates.map(d => d.id), [2])

		// Selecting 1mb preset switches cleanly out of custom mode
		select.value = '1mb'
		select.dispatchEvent(new window.Event('change'))
		await settle()
		assert.equal(vm.$refs.nav.minSizeBytes, 1048576)
		assert.equal(vm.$refs.nav.selectedMinSizePreset, '1mb')

		vm.$destroy()
	})

	test('DuplicateNavigation min-size select CSS enforces >= 44px touch targets, :focus-visible, logical properties, and zero XSS/dashes', () => {
		const filtersSource = readFileSync(resolve(root, 'src/tools/duplicateFilters.js'), 'utf8')
		const navSource = readFileSync(resolve(root, 'src/components/DuplicateNavigation.vue'), 'utf8')

		for (const content of [filtersSource, navSource]) {
			assert.ok(!/[\u2013\u2014]/.test(content), 'no U+2013/U+2014 dashes allowed')
			assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(content), 'no DOM XSS sinks allowed')
		}

		const filterCssStart = navSource.indexOf('/* Quick File-Type Filter Chips & Live Reclaimable Summary */')
		const filterCssEnd = navSource.indexOf('/* Consistent highlighting')
		const filterCssBlock = navSource.slice(filterCssStart, filterCssEnd)

		assert.ok(filterCssBlock.includes('.min-size-filter-select'))
		assert.ok(filterCssBlock.includes('.min-size-filter-select:focus-visible'))
		assert.ok(filterCssBlock.includes('min-inline-size: 44px'))
		assert.ok(filterCssBlock.includes('min-block-size: 44px'))
		assert.ok(!/(?:margin|padding|border)-(?:left|right|top|bottom)/.test(filterCssBlock), 'new CSS must use logical properties only')
	})
})

describe('Cycle 68: MIN_COPIES_PRESETS, filterDuplicatesByMinCopies, and accessible minimum copies selector', () => {
	test('MIN_COPIES_PRESETS exposes frozen copy thresholds and filterDuplicatesByMinCopies filters purely without mutation', () => {
		const { MIN_COPIES_PRESETS, filterDuplicatesByMinCopies } = loadModule('src/tools/duplicateFilters.js')

		assert.deepEqual(MIN_COPIES_PRESETS, {
			any: 0,
			'3plus': 3,
			'5plus': 5,
		})
		assert.equal(Object.isFrozen(MIN_COPIES_PRESETS), true)

		const twoCopiesGroup = Object.freeze({
			id: 1,
			files: Object.freeze([
				Object.freeze({ path: '/u/files/a1.txt', size: 100 }),
				Object.freeze({ path: '/u/files/a2.txt', size: 100 }),
			]),
		})
		const threeCopiesGroup = Object.freeze({
			id: 2,
			files: Object.freeze([
				Object.freeze({ path: '/u/files/b1.png', size: 200 }),
				Object.freeze({ path: '/u/files/b2.png', size: 200 }),
				Object.freeze({ path: '/u/files/b3.png', size: 200 }),
			]),
		})
		const fiveCopiesGroup = Object.freeze({
			id: 3,
			files: Object.freeze([
				Object.freeze({ path: '/u/files/c1.mp4', size: 300 }),
				Object.freeze({ path: '/u/files/c2.mp4', size: 300 }),
				Object.freeze({ path: '/u/files/c3.mp4', size: 300 }),
				Object.freeze({ path: '/u/files/c4.mp4', size: 300 }),
				Object.freeze({ path: '/u/files/c5.mp4', size: 300 }),
			]),
		})
		const countFallbackGroup = Object.freeze({
			id: 4,
			count: 6,
		})
		const invalidCountFallbackGroup = Object.freeze({
			id: 5,
			count: '',
		})

		const frozenInput = Object.freeze([
			twoCopiesGroup,
			threeCopiesGroup,
			fiveCopiesGroup,
			countFallbackGroup,
			invalidCountFallbackGroup,
		])

		const anyResult = filterDuplicatesByMinCopies(frozenInput, 'any')
		assert.notEqual(anyResult, frozenInput)
		assert.deepEqual(anyResult.map(g => g.id), [1, 2, 3, 4, 5])

		assert.deepEqual(filterDuplicatesByMinCopies(frozenInput, '3plus').map(g => g.id), [2, 3, 4])
		assert.deepEqual(filterDuplicatesByMinCopies(frozenInput, '5plus').map(g => g.id), [3, 4])
		assert.deepEqual(filterDuplicatesByMinCopies(frozenInput, ' 3PLUS ').map(g => g.id), [2, 3, 4])

		// Unknown, null, undefined presets fall back to 'any'; non-array input returns []
		assert.deepEqual(filterDuplicatesByMinCopies(frozenInput, 'unknown').map(g => g.id), [1, 2, 3, 4, 5])
		assert.deepEqual(filterDuplicatesByMinCopies(frozenInput, null).map(g => g.id), [1, 2, 3, 4, 5])
		assert.deepEqual(filterDuplicatesByMinCopies(undefined, '3plus'), [])
		assert.deepEqual(filterDuplicatesByMinCopies(null, '5plus'), [])
	})

	test('DuplicateNavigation renders accessible minimum copies select, filters duplicates + counts, and resets via Reset filters', async () => {
		window.localStorage.clear()
		const DuplicateNavigation = createNavigationComponent()
		const emittedQueryChanges = []
		const oneMb = 1024 * 1024

		const makeFiles = (prefix, count, ext = 'jpg', mimetype = 'image/jpeg') => Array.from(
			{ length: count },
			(_, idx) => ({
				id: `${prefix}-${idx + 1}`,
				path: `/u/files/${prefix}-${idx + 1}.${ext}`,
				mimetype,
				size: oneMb,
			}),
		)

		const vm = new Vue({
			render(h) {
				return h(DuplicateNavigation, {
					ref: 'nav',
					props: {
						acknowledgedDuplicates: [
							{
								id: 100,
								hash: 'ack-five',
								files: makeFiles('ack', 5, 'pdf', 'application/pdf'),
							},
						],
						unacknowledgedDuplicates: [
							{
								id: 1,
								hash: 'two-copies',
								files: makeFiles('two', 2),
							},
							{
								id: 2,
								hash: 'three-copies',
								files: makeFiles('three', 3),
							},
							{
								id: 3,
								hash: 'five-copies',
								files: makeFiles('five', 5, 'zip', 'application/zip'),
							},
						],
					},
					on: {
						'query-options-changed': payload => emittedQueryChanges.push(payload),
					},
				})
			},
		}).$mount()
		await settle()

		const nav = vm.$refs.nav
		const select = vm.$el.querySelector('select.min-copies-filter-select')
		const label = vm.$el.querySelector('label.min-copies-filter-label')
		assert.ok(select, 'minimum copies select is rendered')
		assert.ok(label, 'minimum copies label is rendered')
		assert.equal(label.getAttribute('for'), select.getAttribute('id'))
		assert.ok(select.getAttribute('aria-label'))
		assert.equal(select.value, 'any')
		assert.deepEqual(
			Array.from(select.querySelectorAll('option')).map(o => o.value),
			['any', '3plus', '5plus'],
		)

		// Change to 3+ copies via DOM select event
		select.value = '3plus'
		select.dispatchEvent(new window.Event('change'))
		await settle()

		assert.equal(nav.selectedMinCopiesPreset, '3plus')
		assert.deepEqual(nav.filteredUnacknowledgedDuplicates.map(d => d.id), [2, 3])
		assert.deepEqual(nav.filteredAcknowledgedDuplicates.map(d => d.id), [100])
		assert.equal(emittedQueryChanges.length, 0)

		const readChipTexts = () => Array.from(vm.$el.querySelectorAll('button.filter-chip'))
			.map(btn => btn.textContent.replace(/\s+/g, ' ').trim())
		assert.deepEqual(readChipTexts(), [
			'All (3)',
			'Images (1)',
			'Videos (0)',
			'Audio (0)',
			'Documents (1)',
			'Archives (1)',
			'> 10 MB (0)',
		])

		// Change to 5+ copies via DOM select event
		select.value = '5plus'
		select.dispatchEvent(new window.Event('change'))
		await settle()

		assert.equal(nav.selectedMinCopiesPreset, '5plus')
		assert.deepEqual(nav.filteredUnacknowledgedDuplicates.map(d => d.id), [3])
		assert.deepEqual(nav.filteredAcknowledgedDuplicates.map(d => d.id), [100])

		// Reset filters button is visible and resets select back to 'any'
		const resetBtn = vm.$el.querySelector('button.reset-filters-button')
		assert.ok(resetBtn, 'Reset filters button appears when minCopies preset is active')
		resetBtn.click()
		await settle()

		assert.equal(nav.selectedMinCopiesPreset, 'any')
		assert.equal(select.value, 'any')
		assert.deepEqual(nav.filteredUnacknowledgedDuplicates.map(d => d.id), [1, 2, 3])
		assert.deepEqual(nav.filteredAcknowledgedDuplicates.map(d => d.id), [100])
		assert.equal(vm.$el.querySelector('button.reset-filters-button'), null)

		vm.$destroy()
	})

	test('DuplicateNavigation combines minimum copies filter with category filter and shows filtered-empty state when none match', async () => {
		window.localStorage.clear()
		const DuplicateNavigation = createNavigationComponent()

		const vm = new Vue({
			render(h) {
				return h(DuplicateNavigation, {
					ref: 'nav',
					props: {
						acknowledgedDuplicates: [],
						unacknowledgedDuplicates: [
							{
								id: 1,
								hash: 'two-images',
								files: [
									{ id: 11, path: '/Photos/a.jpg', mimetype: 'image/jpeg', size: 2048 },
									{ id: 12, path: '/Photos/b.jpg', mimetype: 'image/jpeg', size: 2048 },
								],
							},
							{
								id: 2,
								hash: 'three-docs',
								files: [
									{ id: 21, path: '/Docs/a.pdf', mimetype: 'application/pdf', size: 2048 },
									{ id: 22, path: '/Docs/b.pdf', mimetype: 'application/pdf', size: 2048 },
									{ id: 23, path: '/Docs/c.pdf', mimetype: 'application/pdf', size: 2048 },
								],
							},
						],
					},
				})
			},
		}).$mount()
		await settle()

		const nav = vm.$refs.nav
		const select = vm.$el.querySelector('select.min-copies-filter-select')
		const chips = Array.from(vm.$el.querySelectorAll('button.filter-chip'))

		// Filter to Images + 3+ copies -> matches 0 groups (filtered-empty state)
		chips[1].click()
		select.value = '3plus'
		select.dispatchEvent(new window.Event('change'))
		await settle()

		assert.equal(nav.filteredUnacknowledgedDuplicates.length, 0)
		assert.equal(nav.unacknowledgedEmptyState, 'filtered-empty')
		const emptyResetBtn = vm.$el.querySelector('.duplicate-section-unacknowledged button.empty-state-reset-button')
		assert.ok(emptyResetBtn, 'empty-state Reset filters button renders when combined filters match none')

		emptyResetBtn.click()
		await settle()
		assert.equal(nav.selectedCategory, 'all')
		assert.equal(nav.selectedMinCopiesPreset, 'any')
		assert.equal(nav.filteredUnacknowledgedDuplicates.length, 2)

		vm.$destroy()
	})

	test('DuplicateNavigation min-copies select CSS enforces >= 44px touch targets, :focus-visible, logical properties, and zero XSS/dashes', () => {
		const filtersSource = readFileSync(resolve(root, 'src/tools/duplicateFilters.js'), 'utf8')
		const navSource = readFileSync(resolve(root, 'src/components/DuplicateNavigation.vue'), 'utf8')

		for (const content of [filtersSource, navSource]) {
			assert.ok(!/[\u2013\u2014]/.test(content), 'no U+2013/U+2014 dashes allowed')
			assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(content), 'no DOM XSS sinks allowed')
		}

		const filterCssStart = navSource.indexOf('/* Quick File-Type Filter Chips & Live Reclaimable Summary */')
		const filterCssEnd = navSource.indexOf('/* Consistent highlighting')
		const filterCssBlock = navSource.slice(filterCssStart, filterCssEnd)

		assert.ok(filterCssBlock.includes('.min-copies-filter-row'))
		assert.ok(filterCssBlock.includes('.min-copies-filter-label'))
		assert.ok(filterCssBlock.includes('.min-copies-filter-select'))
		assert.ok(filterCssBlock.includes('.min-copies-filter-select:focus-visible'))
		assert.ok(filterCssBlock.includes('min-inline-size: 44px'))
		assert.ok(filterCssBlock.includes('min-block-size: 44px'))
		assert.ok(!/(?:margin|padding|border)-(?:left|right|top|bottom)/.test(filterCssBlock), 'new CSS must use logical properties only')
	})
})

describe('Cycle 71: countActiveTriageFilters and Reset filters (N) live counter', () => {
	test('countActiveTriageFilters returns exact active count 0..6 across all filter dimensions and edge cases', () => {
		const { countActiveTriageFilters } = loadModule('src/tools/duplicateFilters.js')

		assert.equal(countActiveTriageFilters(), 0)
		assert.equal(countActiveTriageFilters(null), 0)
		assert.equal(countActiveTriageFilters(undefined), 0)
		assert.equal(countActiveTriageFilters([]), 0)
		assert.equal(countActiveTriageFilters('invalid'), 0)

		// Default / whitespace / non-string / unknown inputs yield 0
		assert.equal(countActiveTriageFilters({
			category: 'all',
			extension: '',
			folderQuery: '   ',
			minSizePreset: 'any',
			minCopiesPreset: 'any',
			searchQuery: '',
		}), 0)
		assert.equal(countActiveTriageFilters({
			category: 'unknown',
			extension: null,
			folderQuery: 42,
			minSizePreset: 'bogus',
			minCopiesPreset: '2plus',
			searchQuery: '   ',
		}), 0)

		// Individual dimensions each increment count by 1
		assert.equal(countActiveTriageFilters({ category: 'images' }), 1)
		assert.equal(countActiveTriageFilters({ category: ' LARGE ' }), 1)
		assert.equal(countActiveTriageFilters({ extension: '.jpg' }), 1)
		assert.equal(countActiveTriageFilters({ folderQuery: '/Photos' }), 1)
		assert.equal(countActiveTriageFilters({ minSizePreset: '10mb' }), 1)
		assert.equal(countActiveTriageFilters({ minSizePreset: 'custom' }), 1)
		assert.equal(countActiveTriageFilters({ minCopiesPreset: ' 3PLUS ' }), 1)
		assert.equal(countActiveTriageFilters({ searchQuery: 'holiday' }), 1)

		// Cumulative counts 2..6
		assert.equal(countActiveTriageFilters({
			category: 'documents',
			folderQuery: '!/Backups',
		}), 2)
		assert.equal(countActiveTriageFilters({
			category: 'videos',
			extension: '.mp4',
			minSizePreset: '100mb',
		}), 3)
		assert.equal(countActiveTriageFilters({
			category: 'images',
			extension: '.jpg',
			folderQuery: '/Photos',
			minSizePreset: '1mb',
			minCopiesPreset: '5plus',
			searchQuery: 'IMG_',
		}), 6)
	})

	test('DuplicateNavigation displays Reset filters (N) with aria-live="polite" across 1..6 active filters and resets cleanly', async () => {
		window.localStorage.clear()
		const DuplicateNavigation = createNavigationComponent()
		const fifteenMb = 15 * 1024 * 1024

		const vm = new Vue({
			render(h) {
				return h(DuplicateNavigation, {
					ref: 'nav',
					props: {
						acknowledgedDuplicates: [],
						unacknowledgedDuplicates: [
							{
								id: 1,
								hash: 'photo-set',
								files: [
									{ id: 11, path: '/Photos/vacation.jpg', mimetype: 'image/jpeg', size: fifteenMb },
									{ id: 12, path: '/Photos/vacation-copy.jpg', mimetype: 'image/jpeg', size: fifteenMb },
									{ id: 13, path: '/Downloads/vacation.jpg', mimetype: 'image/jpeg', size: fifteenMb },
								],
							},
						],
					},
				})
			},
		}).$mount()
		await settle()

		const nav = vm.$refs.nav
		assert.equal(vm.$el.querySelector('button.reset-filters-button'), null)

		// Sort-only keeps button label free of "(0)" while remaining accessible
		nav.setSortOption('size-desc')
		await settle()
		let resetBtn = vm.$el.querySelector('button.reset-filters-button')
		assert.ok(resetBtn)
		assert.equal(resetBtn.getAttribute('aria-live'), 'polite')
		assert.equal(resetBtn.textContent.trim(), 'Reset filters')
		assert.equal(resetBtn.getAttribute('aria-label'), 'Reset filters')

		// Activate all 6 triage filters progressively and verify 1..6
		nav.setCategoryFilter('images')
		await settle()
		assert.equal(resetBtn.textContent.trim(), 'Reset filters (1)')
		assert.equal(resetBtn.getAttribute('aria-label'), 'Reset filters (1)')

		nav.toggleExtensionFilter('.jpg')
		await settle()
		assert.equal(resetBtn.textContent.trim(), 'Reset filters (2)')

		nav.folderQuery = '/Photos'
		await settle()
		assert.equal(resetBtn.textContent.trim(), 'Reset filters (3)')

		nav.setMinSizePreset('10mb')
		await settle()
		assert.equal(resetBtn.textContent.trim(), 'Reset filters (4)')

		nav.setMinCopiesPreset('3plus')
		await settle()
		assert.equal(resetBtn.textContent.trim(), 'Reset filters (5)')

		nav.handleSearch({ query: 'vacation', type: 'simple' })
		await settle()
		assert.equal(nav.activeTriageFilterCount, 6)
		assert.equal(resetBtn.textContent.trim(), 'Reset filters (6)')
		assert.equal(resetBtn.getAttribute('aria-label'), 'Reset filters (6)')

		// Clicking Reset filters clears all filters & sorting and hides the button
		resetBtn.click()
		await settle()
		assert.equal(nav.activeTriageFilterCount, 0)
		assert.equal(vm.$el.querySelector('button.reset-filters-button'), null)

		vm.$destroy()
	})

	test('Cycle 71 Reset filters counter adheres to >= 44px targets, :focus-visible, logical CSS, zero XSS, and zero dashes', () => {
		const filtersSource = readFileSync(resolve(root, 'src/tools/duplicateFilters.js'), 'utf8')
		const navSource = readFileSync(resolve(root, 'src/components/DuplicateNavigation.vue'), 'utf8')

		for (const content of [filtersSource, navSource]) {
			assert.ok(!/[\u2013\u2014]/.test(content), 'no U+2013/U+2014 dashes allowed')
			assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(content), 'no DOM XSS sinks allowed')
		}

		const filterCssStart = navSource.indexOf('/* Quick File-Type Filter Chips & Live Reclaimable Summary */')
		const filterCssEnd = navSource.indexOf('/* Consistent highlighting')
		const filterCssBlock = navSource.slice(filterCssStart, filterCssEnd)

		assert.ok(filterCssBlock.includes('.reset-filters-button'))
		assert.ok(filterCssBlock.includes('.reset-filters-button:focus-visible'))
		assert.ok(filterCssBlock.includes('font-variant-numeric: tabular-nums'))
		assert.ok(filterCssBlock.includes('min-inline-size: 44px'))
		assert.ok(filterCssBlock.includes('min-block-size: 44px'))
		assert.ok(!/(?:margin|padding|border)-(?:left|right|top|bottom)/.test(filterCssBlock), 'new CSS must use logical properties only')
	})
})

describe('Cycle 74: buildActiveFilterChips and clickable individual active filter chips in DuplicateNavigation', () => {
	test('buildActiveFilterChips returns deterministic { key, label } chips across all 6 dimensions and edge cases', () => {
		const { buildActiveFilterChips, countActiveTriageFilters } = loadModule('src/tools/duplicateFilters.js')

		assert.deepEqual(buildActiveFilterChips(), [])
		assert.deepEqual(buildActiveFilterChips(null), [])
		assert.deepEqual(buildActiveFilterChips(undefined), [])
		assert.deepEqual(buildActiveFilterChips([]), [])
		assert.deepEqual(buildActiveFilterChips('invalid'), [])

		assert.deepEqual(buildActiveFilterChips({
			category: 'all',
			extension: '  ',
			folderQuery: '   ',
			minSizePreset: 'any',
			minCopiesPreset: 'any',
			searchQuery: '',
		}), [])

		assert.deepEqual(buildActiveFilterChips({ category: 'images' }), [
			{ key: 'category', label: 'Images' },
		])
		assert.deepEqual(buildActiveFilterChips({ category: ' LARGE ' }), [
			{ key: 'category', label: '> 10 MB' },
		])
		assert.deepEqual(buildActiveFilterChips({ extension: ' .jpg ' }), [
			{ key: 'extension', label: '.jpg' },
		])
		assert.deepEqual(buildActiveFilterChips({ folderQuery: ' /Photos ' }), [
			{ key: 'folder', label: 'Folder: /Photos' },
		])
		assert.deepEqual(buildActiveFilterChips({ minSizePreset: '10mb' }), [
			{ key: 'minSize', label: '>= 10 MB' },
		])
		assert.deepEqual(buildActiveFilterChips({ minSizePreset: 'custom' }), [
			{ key: 'minSize', label: 'Custom size' },
		])
		assert.deepEqual(buildActiveFilterChips({ minSizePreset: 'custom', minSizeBytes: 5 * 1024 * 1024 }), [
			{ key: 'minSize', label: '>= 5 MB' },
		])
		assert.deepEqual(buildActiveFilterChips({ minCopiesPreset: ' 3PLUS ' }), [
			{ key: 'minCopies', label: '3+ copies' },
		])
		assert.deepEqual(buildActiveFilterChips({ minCopiesPreset: '5plus' }), [
			{ key: 'minCopies', label: '5+ copies' },
		])
		assert.deepEqual(buildActiveFilterChips({ searchQuery: ' holiday ' }), [
			{ key: 'search', label: 'Search: holiday' },
		])

		const fullState = {
			category: 'images',
			extension: '.jpg',
			folderQuery: '/Photos',
			minSizePreset: '10mb',
			minCopiesPreset: '3plus',
			searchQuery: 'IMG_',
		}
		const fullChips = buildActiveFilterChips(fullState)
		assert.deepEqual(fullChips, [
			{ key: 'category', label: 'Images' },
			{ key: 'extension', label: '.jpg' },
			{ key: 'folder', label: 'Folder: /Photos' },
			{ key: 'minSize', label: '>= 10 MB' },
			{ key: 'minCopies', label: '3+ copies' },
			{ key: 'search', label: 'Search: IMG_' },
		])
		assert.equal(fullChips.length, countActiveTriageFilters(fullState))
	})

	test('DuplicateNavigation renders clickable active filter chips and removes only the clicked filter without clearing others', async () => {
		window.localStorage.clear()
		const DuplicateNavigation = createNavigationComponent()
		const emittedQueryChanges = []
		const fifteenMb = 15 * 1024 * 1024

		const vm = new Vue({
			render(h) {
				return h(DuplicateNavigation, {
					ref: 'nav',
					props: {
						acknowledgedDuplicates: [],
						unacknowledgedDuplicates: [
							{
								id: 1,
								hash: 'photo-set',
								files: [
									{ id: 11, path: '/Photos/vacation.jpg', mimetype: 'image/jpeg', size: fifteenMb },
									{ id: 12, path: '/Photos/vacation-copy.jpg', mimetype: 'image/jpeg', size: fifteenMb },
									{ id: 13, path: '/Downloads/vacation.jpg', mimetype: 'image/jpeg', size: fifteenMb },
								],
							},
						],
					},
					on: {
						'query-options-changed': payload => emittedQueryChanges.push(payload),
					},
				})
			},
		}).$mount()
		await settle()

		const nav = vm.$refs.nav
		assert.equal(vm.$el.querySelectorAll('button.active-filter-chip').length, 0)

		// Activate sort + all 6 filters
		nav.setSortOption('size-desc')
		nav.setCategoryFilter('images')
		nav.toggleExtensionFilter('.jpg')
		nav.folderQuery = '/Photos'
		nav.setMinSizePreset('10mb')
		nav.setMinCopiesPreset('3plus')
		nav.handleSearch({ query: 'vacation', type: 'simple' })
		await settle()

		const readActiveChips = () => Array.from(vm.$el.querySelectorAll('button.active-filter-chip')).map(btn => ({
			key: btn.getAttribute('data-filter-key'),
			label: btn.querySelector('.active-filter-chip-label').textContent.trim(),
			ariaLabel: btn.getAttribute('aria-label'),
		}))

		assert.deepEqual(readActiveChips().map(c => ({ key: c.key, label: c.label })), [
			{ key: 'category', label: 'Images' },
			{ key: 'extension', label: '.jpg' },
			{ key: 'folder', label: 'Folder: /Photos' },
			{ key: 'minSize', label: '>= 10 MB' },
			{ key: 'minCopies', label: '3+ copies' },
			{ key: 'search', label: 'Search: vacation' },
		])
		assert.equal(readActiveChips()[0].ariaLabel, 'Remove filter: Images')

		// Click minSize chip -> removes only minSize, preserves all 5 other filters and sortOption
		vm.$el.querySelector('button.active-filter-chip[data-filter-key="minSize"]').click()
		await settle()
		assert.equal(nav.minSizeBytes, 0)
		assert.equal(nav.selectedMinSizePreset, 'any')
		assert.equal(nav.sortOption, 'size-desc')
		assert.equal(nav.selectedCategory, 'images')
		assert.equal(nav.selectedExtension, '.jpg')
		assert.equal(nav.folderQuery, '/Photos')
		assert.equal(nav.selectedMinCopiesPreset, '3plus')
		assert.equal(nav.searchPattern, 'vacation')
		assert.deepEqual(emittedQueryChanges[emittedQueryChanges.length - 1], {
			sortBy: 'size-desc',
			minSize: 0,
		})
		assert.deepEqual(readActiveChips().map(c => c.key), ['category', 'extension', 'folder', 'minCopies', 'search'])

		// Click category chip -> removes only category without clearing selectedExtension
		vm.$el.querySelector('button.active-filter-chip[data-filter-key="category"]').click()
		await settle()
		assert.equal(nav.selectedCategory, 'all')
		assert.equal(nav.selectedExtension, '.jpg')
		assert.deepEqual(readActiveChips().map(c => c.key), ['extension', 'folder', 'minCopies', 'search'])

		// Click extension, folder, minCopies, search chips one by one
		vm.$el.querySelector('button.active-filter-chip[data-filter-key="extension"]').click()
		await settle()
		assert.equal(nav.selectedExtension, '')
		assert.equal(nav.folderQuery, '/Photos')

		vm.$el.querySelector('button.active-filter-chip[data-filter-key="folder"]').click()
		await settle()
		assert.equal(nav.folderQuery, '')
		assert.equal(nav.selectedMinCopiesPreset, '3plus')

		vm.$el.querySelector('button.active-filter-chip[data-filter-key="minCopies"]').click()
		await settle()
		assert.equal(nav.selectedMinCopiesPreset, 'any')
		assert.equal(nav.searchPattern, 'vacation')

		vm.$el.querySelector('button.active-filter-chip[data-filter-key="search"]').click()
		await settle()
		assert.equal(nav.searchPattern, '')
		assert.equal(nav.sortOption, 'size-desc')
		assert.equal(vm.$el.querySelectorAll('button.active-filter-chip').length, 0)

		vm.$destroy()
	})

	test('Cycle 74 active filter chips enforce >= 44px targets, :focus-visible, logical CSS, zero XSS, and zero dashes', () => {
		const filtersSource = readFileSync(resolve(root, 'src/tools/duplicateFilters.js'), 'utf8')
		const navSource = readFileSync(resolve(root, 'src/components/DuplicateNavigation.vue'), 'utf8')

		for (const content of [filtersSource, navSource]) {
			assert.ok(!/[\u2013\u2014]/.test(content), 'no U+2013/U+2014 dashes allowed')
			assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(content), 'no DOM XSS sinks allowed')
		}

		const filterCssStart = navSource.indexOf('/* Quick File-Type Filter Chips & Live Reclaimable Summary */')
		const filterCssEnd = navSource.indexOf('/* Consistent highlighting')
		const filterCssBlock = navSource.slice(filterCssStart, filterCssEnd)

		assert.ok(filterCssBlock.includes('.active-filter-chips'))
		assert.ok(filterCssBlock.includes('.active-filter-chip'))
		assert.ok(filterCssBlock.includes('.active-filter-chip:focus-visible'))
		assert.ok(filterCssBlock.includes('flex-wrap: wrap'))
		assert.ok(filterCssBlock.includes('overflow-wrap: anywhere'))
		assert.ok(filterCssBlock.includes('min-inline-size: 44px'))
		assert.ok(filterCssBlock.includes('min-block-size: 44px'))
		assert.ok(!/(?:margin|padding|border)-(?:left|right|top|bottom)/.test(filterCssBlock), 'new CSS must use logical properties only')
	})
})
