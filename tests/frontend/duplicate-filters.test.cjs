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
