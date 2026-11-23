const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

const slotBox = tag => ({
	render(h) {
		return h(tag, this.$slots.default)
	},
})

function createDetailsComponent() {
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})
	const selectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const metadataBadges = loadModule('src/tools/duplicateMetadataBadges.js')
	const deleteSafetyGuard = loadModule('src/tools/deleteSafetyGuard.js')

	const Display = loadComponent('src/components/DuplicateFileDisplay.vue', {
		'@/tools/api': { deleteFile: async () => true },
		'@/tools/clipboardHelper': loadModule('src/tools/clipboardHelper.js'),
		'@/tools/utils': utils,
		'@nextcloud/router': { generateUrl: url => url },
	})

	Vue.component('NcLoadingSpinner', { render: h => h('span') })

	return loadComponent('src/components/DuplicateDetails.vue', {
		'@/tools/api': {
			acknowledgeDuplicate: async () => {},
			unacknowledgeDuplicate: async () => {},
			deleteFiles: async () => ({ success: [], errors: [] }),
			findDuplicates: async () => {},
		},
		'@/tools/utils': utils,
		'@/tools/duplicateSelectionAndExport': selectionAndExport,
		'@/tools/duplicateSortHelper': loadModule('src/tools/duplicateSortHelper.js'),
		'@/tools/duplicateStats': loadModule('src/tools/duplicateStats.js'),
		'@/tools/duplicateMetadataBadges': metadataBadges,
		'@/tools/deleteSafetyGuard': deleteSafetyGuard,
		'@/tools/duplicateGroupSummary': loadModule('src/tools/duplicateGroupSummary.js'),
		'@nextcloud/dialogs': { showSuccess() {}, showError() {} },
		'./DuplicateFileDisplay.vue': { __esModule: true, default: Display },
	})
}

function createNavigationComponent() {
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})
	const duplicateFilters = loadModule('src/tools/duplicateFilters.js')
	const selectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const metadataBadges = loadModule('src/tools/duplicateMetadataBadges.js')
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
		'@/tools/duplicateSelectionAndExport': selectionAndExport,
		'@/tools/duplicateSortHelper': loadModule('src/tools/duplicateSortHelper.js'),
		'@/tools/duplicateStats': loadModule('src/tools/duplicateStats.js'),
		'@/tools/duplicateMetadataBadges': metadataBadges,
	})
}

describe('Cycle 38: smart keep-rule selection and CWE-1236-safe CSV export', () => {
	test('selectDuplicatesByKeepRule keeps oldest, newest, or shortest_path and always preserves at least 1 master', () => {
		const { selectDuplicatesByKeepRule } = loadModule('src/tools/duplicateSelectionAndExport.js')

		const files = [
			{ id: 10, path: '/alice/files/Archive/2023/copy/photo.jpg', mtime: 2000, isInOriginFolder: false },
			{ id: 11, path: '/alice/files/photo.jpg', mtime: 3000, isInOriginFolder: false },
			{ id: 12, path: '/alice/files/Old/photo.jpg', mtime: 1000, isInOriginFolder: false },
		]

		assert.deepEqual(selectDuplicatesByKeepRule(files, 'oldest'), [10, 11])
		assert.deepEqual(selectDuplicatesByKeepRule(files, 'newest'), [10, 12])
		assert.deepEqual(selectDuplicatesByKeepRule(files, 'shortest_path'), [10, 12])

		// ISO updatedAt timestamps (as returned by FileInfo::jsonSerialize)
		const isoFiles = [
			{ id: 0, path: '/alice/files/b/doc.pdf', updatedAt: '2025-02-01T10:00:00Z' },
			{ id: 2, path: '/alice/files/a/doc.pdf', updatedAt: '2025-01-01T10:00:00Z' },
		]
		assert.deepEqual(selectDuplicatesByKeepRule(isoFiles, 'oldest'), [0])
		assert.deepEqual(selectDuplicatesByKeepRule(isoFiles, 'newest'), [2])
	})

	test('selectDuplicatesByKeepRule uses deterministic path tie-breaker when mtime or length are equal and never deletes 100%', () => {
		const { selectDuplicatesByKeepRule } = loadModule('src/tools/duplicateSelectionAndExport.js')

		// Equal mtime and equal path length in shuffled orders
		const orderA = [
			{ id: 3, path: '/u/files/c/item.txt', mtime: 5000 },
			{ id: 1, path: '/u/files/a/item.txt', mtime: 5000 },
			{ id: 2, path: '/u/files/b/item.txt', mtime: 5000 },
		]
		const orderB = [orderA[2], orderA[0], orderA[1]]

		for (const rule of ['oldest', 'newest', 'shortest_path']) {
			const resA = selectDuplicatesByKeepRule(orderA, rule).slice().sort((a, b) => a - b)
			const resB = selectDuplicatesByKeepRule(orderB, rule).slice().sort((a, b) => a - b)
			assert.deepEqual(resA, [2, 3], `${rule} keeps /u/files/a/item.txt (id=1)`)
			assert.deepEqual(resB, [2, 3], `${rule} is deterministic regardless of input array order`)
			assert.equal(resA.length, orderA.length - 1, `${rule} never selects 100% of the group`)
		}

		// Missing mtime and missing IDs -> falls back to path strings deterministically
		const noIdsNoMtime = [
			{ id: null, path: '/u/files/z/same.bin' },
			{ id: null, path: '/u/files/a/same.bin' },
		]
		assert.deepEqual(selectDuplicatesByKeepRule(noIdsNoMtime, 'oldest'), ['/u/files/z/same.bin'])
		assert.deepEqual(selectDuplicatesByKeepRule(noIdsNoMtime, 'newest'), ['/u/files/z/same.bin'])
	})

	test('selectDuplicatesByKeepRule never selects protected origin files and handles degenerate inputs safely', () => {
		const { selectDuplicatesByKeepRule } = loadModule('src/tools/duplicateSelectionAndExport.js')

		const withProtectedNewest = [
			{ id: 1, path: '/u/files/origin/a.jpg', mtime: 9000, isInOriginFolder: true },
			{ id: 2, path: '/u/files/dup1/a.jpg', mtime: 1000, isInOriginFolder: false },
			{ id: 3, path: '/u/files/dup2/a.jpg', mtime: 5000, isInOriginFolder: false },
		]
		// Keeping newest picks protected file 1, selects 2 and 3
		assert.deepEqual(selectDuplicatesByKeepRule(withProtectedNewest, 'newest'), [2, 3])
		// Keeping oldest picks file 2, never includes protected file 1 in deletion list
		assert.deepEqual(selectDuplicatesByKeepRule(withProtectedNewest, 'oldest'), [3])

		// All protected -> empty deletion list
		assert.deepEqual(
			selectDuplicatesByKeepRule(
				[
					{ id: 1, path: '/o/1.jpg', isInOriginFolder: true },
					{ id: 2, path: '/o/2.jpg', isInOriginFolder: true },
				],
				'oldest',
			),
			[],
		)

		// Single file, empty, null, or invalid rule -> empty deletion list
		assert.deepEqual(selectDuplicatesByKeepRule([{ id: 1, path: '/a.jpg' }], 'oldest'), [])
		assert.deepEqual(selectDuplicatesByKeepRule([], 'oldest'), [])
		assert.deepEqual(selectDuplicatesByKeepRule(null, 'oldest'), [])
		assert.deepEqual(selectDuplicatesByKeepRule(withProtectedNewest, 'unknown_rule'), [])
	})

	test('escapeCsvCell neutralizes CWE-1236 formula prefixes and enforces RFC 4180 quoting', () => {
		const { escapeCsvCell } = loadModule('src/tools/duplicateSelectionAndExport.js')

		assert.equal(escapeCsvCell('=SUM(A1)'), `"'=SUM(A1)"`)
		assert.equal(escapeCsvCell('+cmd|/C calc!A0'), `"'+cmd|/C calc!A0"`)
		assert.equal(escapeCsvCell('-1+1'), `"'-1+1"`)
		assert.equal(escapeCsvCell('@SUM(1+1)'), `"'@SUM(1+1)"`)
		assert.equal(escapeCsvCell('\t=1+1'), `"'\t=1+1"`)
		assert.equal(escapeCsvCell('\r=1+1'), `"'\r=1+1"`)
		assert.equal(escapeCsvCell(' =SUM(A1)'), `"' =SUM(A1)"`)

		// RFC 4180 special characters
		assert.equal(escapeCsvCell('folder,with,commas/a.jpg'), '"folder,with,commas/a.jpg"')
		assert.equal(escapeCsvCell('say "hello".txt'), '"say ""hello"".txt"')
		assert.equal(escapeCsvCell('line1\nline2'), '"line1\nline2"')
		assert.equal(escapeCsvCell('=1+1,"quoted"'), `"'=1+1,""quoted"""`)

		// Normal values and null/undefined
		assert.equal(escapeCsvCell('normal-file.png'), 'normal-file.png')
		assert.equal(escapeCsvCell(4096), '4096')
		assert.equal(escapeCsvCell(null), '')
		assert.equal(escapeCsvCell(undefined), '')
	})

	test('buildDuplicatesCsv builds RFC 4180 CSV with CWE-1236 protection for all duplicate rows', () => {
		const { buildDuplicatesCsv } = loadModule('src/tools/duplicateSelectionAndExport.js')

		assert.equal(
			buildDuplicatesCsv([]),
			'group_id,hash,status,file_id,path,size_bytes,mimetype,protected',
		)

		const csv = buildDuplicatesCsv([
			{
				id: 42,
				hash: 'abc123',
				acknowledged: false,
				files: [
					{ id: 101, path: '/alice/files/=SUM(A1).csv', size: 2048, mimetype: 'text/csv', isInOriginFolder: true },
					{ id: 102, path: '/alice/files/copy, "2"/+cmd.txt', size: 2048, mimetype: 'text/plain', isInOriginFolder: false },
				],
			},
			{
				id: 43,
				hash: 'def456',
				acknowledged: true,
				files: [
					{ id: null, path: '/alice/files/-1+1/@evil.bin', size: 512, mimetype: 'application/octet-stream', isInOriginFolder: false },
				],
			},
		])

		const lines = csv.split('\r\n')
		assert.equal(lines.length, 4)
		assert.equal(lines[0], 'group_id,hash,status,file_id,path,size_bytes,mimetype,protected')
		assert.equal(lines[1], '42,abc123,unacknowledged,101,/alice/files/=SUM(A1).csv,2048,text/csv,true')
		assert.equal(lines[2], '42,abc123,unacknowledged,102,"/alice/files/copy, ""2""/+cmd.txt",2048,text/plain,false')
		assert.equal(lines[3], '43,def456,acknowledged,,/alice/files/-1+1/@evil.bin,512,application/octet-stream,false')

		// Direct payload at cell start
		const directCsv = buildDuplicatesCsv([
			{
				id: 99,
				hash: '=HYPERLINK("http://evil")',
				acknowledged: false,
				files: [
					{ id: 200, path: '=1+1', size: 10, mimetype: 'text/plain', isInOriginFolder: false },
				],
			},
		])
		const directLine = directCsv.split('\r\n')[1]
		assert.ok(directLine.includes(`"'=HYPERLINK(""http://evil"")"`))
		assert.ok(directLine.includes(`"'=1+1"`))
	})

	test('DuplicateDetails integrates Keep oldest, Keep newest, and Keep shortest path quick buttons', async () => {
		const Details = createDetailsComponent()
		const duplicate = {
			id: 7,
			hash: 'hash-keep',
			acknowledged: false,
			files: [
				{ id: 1, nodeId: 11, path: '/alice/files/deep/nested/folder/pic.jpg', size: 1000, mimetype: 'image/jpeg', mtime: 2000, isInOriginFolder: false },
				{ id: 2, nodeId: 12, path: '/alice/files/pic.jpg', size: 1000, mimetype: 'image/jpeg', mtime: 3000, isInOriginFolder: false },
				{ id: 3, nodeId: 13, path: '/alice/files/old/pic.jpg', size: 1000, mimetype: 'image/jpeg', mtime: 1000, isInOriginFolder: false },
			],
		}

		const wrapper = new Vue({
			render(h) {
				return h(Details, { props: { duplicate } })
			},
		}).$mount()
		await settle()

		const detailsVm = wrapper.$children[0]
		const buttons = Array.from(detailsVm.$el.querySelectorAll('button.keep-rule-button'))
		assert.equal(buttons.length, 3)
		assert.deepEqual(buttons.map(b => b.textContent.trim()), [
			'Keep oldest',
			'Keep newest',
			'Keep shortest path',
		])

		// Keep oldest -> keeps id 3, selects 1 and 2
		buttons[0].click()
		await settle()
		assert.equal(buttons[0].getAttribute('aria-pressed'), 'true')
		assert.equal(buttons[1].getAttribute('aria-pressed'), 'false')
		assert.deepEqual(detailsVm.selectedFiles.map(f => f.id), [1, 2])

		// Keep newest -> keeps id 2, selects 1 and 3
		buttons[1].click()
		await settle()
		assert.equal(buttons[1].getAttribute('aria-pressed'), 'true')
		assert.deepEqual(detailsVm.selectedFiles.map(f => f.id), [1, 3])

		// Keep shortest path -> keeps id 2 (/alice/files/pic.jpg), selects 1 and 3
		buttons[2].click()
		await settle()
		assert.equal(buttons[2].getAttribute('aria-pressed'), 'true')
		assert.deepEqual(detailsVm.selectedFiles.map(f => f.id), [1, 3])

		wrapper.$destroy()
	})

	test('DuplicateNavigation Export CSV button disables when empty and exports filtered list via Blob + <a download>', async () => {
		const DuplicateNavigation = createNavigationComponent()

		// Empty state -> Export CSV disabled
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

		const emptyExportBtn = emptyVm.$el.querySelector('button.export-csv-button')
		assert.ok(emptyExportBtn, 'Export CSV button exists')
		assert.equal(emptyExportBtn.disabled, true, 'Export CSV button is disabled when filtered list is empty')
		emptyVm.$destroy()

		// Populated + filtered state
		const unacknowledged = [
			{
				id: 1,
				hash: 'img1',
				acknowledged: false,
				files: [
					{ id: 11, path: '/alice/files/=SUM(A1).jpg', size: 2048, mimetype: 'image/jpeg', isInOriginFolder: false },
					{ id: 12, path: '/alice/files/copy/photo.jpg', size: 2048, mimetype: 'image/jpeg', isInOriginFolder: false },
				],
			},
			{
				id: 2,
				hash: 'doc1',
				acknowledged: false,
				files: [
					{ id: 21, path: '/alice/files/notes.pdf', size: 1024, mimetype: 'application/pdf', isInOriginFolder: false },
					{ id: 22, path: '/alice/files/backup/notes.pdf', size: 1024, mimetype: 'application/pdf', isInOriginFolder: false },
				],
			},
		]

		const vm = new Vue({
			render(h) {
				return h(DuplicateNavigation, {
					props: {
						acknowledgedDuplicates: [],
						unacknowledgedDuplicates: unacknowledged,
					},
				})
			},
		}).$mount()
		await settle()

		const exportBtn = vm.$el.querySelector('button.export-csv-button')
		assert.equal(exportBtn.disabled, false)

		// Filter to Images only before exporting
		const chips = Array.from(vm.$el.querySelectorAll('button.filter-chip'))
		chips[1].click()
		await settle()

		const originalCreateObjectURL = global.URL.createObjectURL
		const originalRevokeObjectURL = global.URL.revokeObjectURL
		const originalAnchorClick = document.defaultView.HTMLAnchorElement.prototype.click
		const capturedBlobs = []
		const clickedLinks = []

		global.URL.createObjectURL = blob => {
			capturedBlobs.push(blob)
			return 'blob:https://cloud.example.test/mock-csv-1'
		}
		global.URL.revokeObjectURL = () => {}
		document.defaultView.HTMLAnchorElement.prototype.click = function clickSpy() {
			clickedLinks.push({
				href: this.href,
				download: this.getAttribute('download'),
			})
		}

		try {
			exportBtn.click()
			await settle()

			assert.equal(capturedBlobs.length, 1)
			assert.equal(clickedLinks.length, 1)
			assert.equal(clickedLinks[0].download, 'duplicates-export.csv')
			assert.ok(clickedLinks[0].href.startsWith('blob:'))

			const exportedText = await capturedBlobs[0].text()
			assert.ok(exportedText.includes('img1'), 'exported CSV contains filtered image group')
			assert.ok(!exportedText.includes('doc1'), 'exported CSV excludes filtered-out document group')
			assert.ok(exportedText.includes('/alice/files/=SUM(A1).jpg'))
		} finally {
			global.URL.createObjectURL = originalCreateObjectURL
			global.URL.revokeObjectURL = originalRevokeObjectURL
			document.defaultView.HTMLAnchorElement.prototype.click = originalAnchorClick
		}

		// Filter to Videos (0 results) -> Export CSV becomes disabled again
		chips[2].click()
		await settle()
		assert.equal(exportBtn.disabled, true)

		vm.$destroy()
	})

	test('Cycle 38 UI styles enforce >= 44px targets, focus-visible, logical CSS, and zero XSS/dashes', () => {
		const detailsSource = readFileSync(resolve(root, 'src/components/DuplicateDetails.vue'), 'utf8')
		const navSource = readFileSync(resolve(root, 'src/components/DuplicateNavigation.vue'), 'utf8')

		assert.ok(detailsSource.includes('.keep-rule-button'))
		assert.ok(detailsSource.includes('min-block-size: 44px'))
		assert.ok(detailsSource.includes('min-inline-size: 44px'))
		assert.ok(detailsSource.includes('.keep-rule-button:hover:not(:disabled),\n.keep-rule-button:focus-visible:not(:disabled)'))

		const keepCssStart = detailsSource.indexOf('.keep-rules-toolbar {')
		const keepCssEnd = detailsSource.indexOf('.toolbar-button {')
		const keepCssBlock = detailsSource.slice(keepCssStart, keepCssEnd)
		assert.ok(!/(?:margin|padding|border)-(?:left|right|top|bottom)/.test(keepCssBlock), 'DuplicateDetails keep-rule CSS uses logical properties only')

		assert.ok(navSource.includes('.export-csv-button'))
		assert.ok(navSource.includes('.export-csv-button:focus-visible'))
		const exportCssStart = navSource.indexOf('.export-csv-button {')
		const exportCssEnd = navSource.indexOf('/* Consistent highlighting')
		const exportCssBlock = navSource.slice(exportCssStart, exportCssEnd)
		assert.ok(exportCssBlock.includes('min-block-size: 44px'))
		assert.ok(!/(?:margin|padding|border)-(?:left|right|top|bottom)/.test(exportCssBlock), 'DuplicateNavigation export CSS uses logical properties only')
	})
})

describe('Cycle 77: structured JSON report export', () => {
	test('buildDuplicatesJson builds duplicatefinder.report.v1 schema with groupCount, totalReclaimableBytes, and normalized groups', () => {
		const { buildDuplicatesJson, JSON_REPORT_SCHEMA } = loadModule('src/tools/duplicateSelectionAndExport.js')

		assert.equal(JSON_REPORT_SCHEMA, 'duplicatefinder.report.v1')

		const emptyReport = JSON.parse(buildDuplicatesJson([], '2026-11-23T05:14:21.000Z'))
		assert.deepEqual(emptyReport, {
			schema: 'duplicatefinder.report.v1',
			exportedAt: '2026-11-23T05:14:21.000Z',
			groupCount: 0,
			totalReclaimableBytes: 0,
			groups: [],
		})

		const nullReport = JSON.parse(buildDuplicatesJson(null))
		assert.equal(nullReport.schema, 'duplicatefinder.report.v1')
		assert.equal(nullReport.groupCount, 0)
		assert.equal(nullReport.totalReclaimableBytes, 0)
		assert.deepEqual(nullReport.groups, [])
		assert.ok(!Number.isNaN(Date.parse(nullReport.exportedAt)), 'exportedAt is a valid ISO timestamp')

		const json = buildDuplicatesJson([
			{
				id: 42,
				hash: 'abc123',
				acknowledged: false,
				files: [
					{ id: 101, path: '/alice/files/photo.jpg', size: 2048, mimetype: 'image/jpeg', isInOriginFolder: true },
					{ id: 102, path: '/alice/files/copy/photo.jpg', size: 2048, mimetype: 'image/jpeg', isInOriginFolder: false },
					{ id: 103, path: '/alice/files/archive/photo.jpg', size: 2048, mimetype: 'image/jpeg', isInOriginFolder: false },
				],
			},
			{
				id: 43,
				hash: 'def456',
				acknowledged: true,
				files: [
					{ id: null, path: '/alice/files/doc.pdf', size: 512, mimetype: 'application/pdf', isInOriginFolder: false },
					{ id: 202, path: '/alice/files/backup/doc.pdf', size: 512, mimetype: 'application/pdf', isInOriginFolder: false },
				],
			},
			{
				id: 44,
				hash: 'single1',
				acknowledged: false,
				files: [
					{ id: 301, path: '/alice/files/solo.txt', size: -100, mimetype: 'text/plain', isInOriginFolder: false },
				],
			},
		], '2026-11-23T05:15:00.000Z')

		const parsed = JSON.parse(json)
		assert.equal(parsed.schema, 'duplicatefinder.report.v1')
		assert.equal(parsed.exportedAt, '2026-11-23T05:15:00.000Z')
		assert.equal(parsed.groupCount, 3)
		// Group 42: (3 - 1) * 2048 = 4096; Group 43: (2 - 1) * 512 = 512; Group 44: 0
		assert.equal(parsed.totalReclaimableBytes, 4608)
		assert.equal(parsed.groups.length, 3)
		assert.deepEqual(parsed.groups[0], {
			id: 42,
			hash: 'abc123',
			status: 'unacknowledged',
			acknowledged: false,
			fileCount: 3,
			reclaimableBytes: 4096,
			files: [
				{ id: 101, path: '/alice/files/photo.jpg', sizeBytes: 2048, mimetype: 'image/jpeg', protected: true },
				{ id: 102, path: '/alice/files/copy/photo.jpg', sizeBytes: 2048, mimetype: 'image/jpeg', protected: false },
				{ id: 103, path: '/alice/files/archive/photo.jpg', sizeBytes: 2048, mimetype: 'image/jpeg', protected: false },
			],
		})
		assert.equal(parsed.groups[1].status, 'acknowledged')
		assert.equal(parsed.groups[1].reclaimableBytes, 512)
		assert.equal(parsed.groups[2].reclaimableBytes, 0)
		assert.equal(parsed.groups[2].files[0].sizeBytes, 0)
	})

	test('downloadDuplicatesJson returns false for empty input and triggers application/json Blob download', async () => {
		const { downloadDuplicatesJson } = loadModule('src/tools/duplicateSelectionAndExport.js')

		assert.equal(downloadDuplicatesJson([]), false)
		assert.equal(downloadDuplicatesJson(null), false)

		const originalCreateObjectURL = global.URL.createObjectURL
		const originalRevokeObjectURL = global.URL.revokeObjectURL
		const originalAnchorClick = document.defaultView.HTMLAnchorElement.prototype.click
		const capturedBlobs = []
		const revokedUrls = []
		const clickedLinks = []

		global.URL.createObjectURL = blob => {
			capturedBlobs.push(blob)
			return 'blob:https://cloud.example.test/mock-json-helper'
		}
		global.URL.revokeObjectURL = url => {
			revokedUrls.push(url)
		}
		document.defaultView.HTMLAnchorElement.prototype.click = function clickSpy() {
			clickedLinks.push({
				href: this.href,
				download: this.getAttribute('download'),
			})
		}

		try {
			const triggered = downloadDuplicatesJson([
				{
					id: 9,
					hash: 'h9',
					acknowledged: false,
					files: [
						{ id: 1, path: '/a.bin', size: 1024, mimetype: 'application/octet-stream', isInOriginFolder: false },
						{ id: 2, path: '/b.bin', size: 1024, mimetype: 'application/octet-stream', isInOriginFolder: false },
					],
				},
			], 'custom-report.json')

			assert.equal(triggered, true)
			assert.equal(capturedBlobs.length, 1)
			assert.equal(capturedBlobs[0].type, 'application/json')
			assert.equal(clickedLinks.length, 1)
			assert.equal(clickedLinks[0].download, 'custom-report.json')
			assert.deepEqual(revokedUrls, ['blob:https://cloud.example.test/mock-json-helper'])

			const parsed = JSON.parse(await capturedBlobs[0].text())
			assert.equal(parsed.schema, 'duplicatefinder.report.v1')
			assert.equal(parsed.groupCount, 1)
			assert.equal(parsed.totalReclaimableBytes, 1024)
		} finally {
			global.URL.createObjectURL = originalCreateObjectURL
			global.URL.revokeObjectURL = originalRevokeObjectURL
			document.defaultView.HTMLAnchorElement.prototype.click = originalAnchorClick
		}
	})

	test('DuplicateNavigation Export JSON button disables when empty and exports filtered list via application/json Blob', async () => {
		window.localStorage.clear()
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

		const emptyJsonBtn = emptyVm.$el.querySelector('button.export-json-button')
		assert.ok(emptyJsonBtn, 'Export JSON button exists')
		assert.equal(emptyJsonBtn.disabled, true, 'Export JSON button is disabled when filtered list is empty')
		emptyVm.$destroy()

		const unacknowledged = [
			{
				id: 1,
				hash: 'img-json-1',
				acknowledged: false,
				files: [
					{ id: 11, path: '/alice/files/photo.jpg', size: 2048, mimetype: 'image/jpeg', isInOriginFolder: false },
					{ id: 12, path: '/alice/files/copy/photo.jpg', size: 2048, mimetype: 'image/jpeg', isInOriginFolder: false },
				],
			},
			{
				id: 2,
				hash: 'doc-json-1',
				acknowledged: false,
				files: [
					{ id: 21, path: '/alice/files/notes.pdf', size: 1024, mimetype: 'application/pdf', isInOriginFolder: false },
					{ id: 22, path: '/alice/files/backup/notes.pdf', size: 1024, mimetype: 'application/pdf', isInOriginFolder: false },
				],
			},
		]

		const vm = new Vue({
			render(h) {
				return h(DuplicateNavigation, {
					props: {
						acknowledgedDuplicates: [],
						unacknowledgedDuplicates: unacknowledged,
					},
				})
			},
		}).$mount()
		await settle()

		const jsonBtn = vm.$el.querySelector('button.export-json-button')
		assert.equal(jsonBtn.disabled, false)
		assert.equal(jsonBtn.textContent.trim(), 'Export JSON')

		// Filter to Images only before exporting
		const chips = Array.from(vm.$el.querySelectorAll('button.filter-chip'))
		chips[1].click()
		await settle()

		const originalCreateObjectURL = global.URL.createObjectURL
		const originalRevokeObjectURL = global.URL.revokeObjectURL
		const originalAnchorClick = document.defaultView.HTMLAnchorElement.prototype.click
		const capturedBlobs = []
		const clickedLinks = []

		global.URL.createObjectURL = blob => {
			capturedBlobs.push(blob)
			return 'blob:https://cloud.example.test/mock-json-nav'
		}
		global.URL.revokeObjectURL = () => {}
		document.defaultView.HTMLAnchorElement.prototype.click = function clickSpy() {
			clickedLinks.push({
				href: this.href,
				download: this.getAttribute('download'),
			})
		}

		try {
			jsonBtn.click()
			await settle()

			assert.equal(capturedBlobs.length, 1)
			assert.equal(capturedBlobs[0].type, 'application/json')
			assert.equal(clickedLinks.length, 1)
			assert.equal(clickedLinks[0].download, 'duplicates-export.json')

			const report = JSON.parse(await capturedBlobs[0].text())
			assert.equal(report.schema, 'duplicatefinder.report.v1')
			assert.equal(report.groupCount, 1)
			assert.equal(report.totalReclaimableBytes, 2048)
			assert.equal(report.groups[0].hash, 'img-json-1')
		} finally {
			global.URL.createObjectURL = originalCreateObjectURL
			global.URL.revokeObjectURL = originalRevokeObjectURL
			document.defaultView.HTMLAnchorElement.prototype.click = originalAnchorClick
		}

		// Filter to Videos (0 results) -> Export JSON becomes disabled again
		chips[2].click()
		await settle()
		assert.equal(jsonBtn.disabled, true)

		vm.$destroy()
		window.localStorage.clear()
	})

	test('Cycle 77 Export JSON styles enforce >= 44px targets, focus-visible, logical CSS, and zero XSS/dashes', () => {
		const navSource = readFileSync(resolve(root, 'src/components/DuplicateNavigation.vue'), 'utf8')
		const exportToolSource = readFileSync(resolve(root, 'src/tools/duplicateSelectionAndExport.js'), 'utf8')

		assert.ok(navSource.includes('.export-json-button'))
		assert.ok(navSource.includes('.export-json-button:focus-visible'))
		assert.ok(!/v-html|innerHTML/.test(navSource), 'DuplicateNavigation has zero v-html/innerHTML sinks')
		assert.ok(!/[\u2013\u2014]/.test(navSource), 'DuplicateNavigation has zero typographic dashes')
		assert.ok(!/[\u2013\u2014]/.test(exportToolSource), 'duplicateSelectionAndExport has zero typographic dashes')
	})
})
