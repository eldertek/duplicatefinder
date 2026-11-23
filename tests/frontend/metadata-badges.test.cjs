const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

function createDetailsComponent(apiOverrides = {}) {
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})
	const selectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const metadataBadges = loadModule('src/tools/duplicateMetadataBadges.js')
	const deleteSafetyGuard = loadModule('src/tools/deleteSafetyGuard.js')

	const api = {
		acknowledgeDuplicate: async () => {},
		unacknowledgeDuplicate: async () => {},
		deleteFiles: async () => ({ success: [], errors: [] }),
		deleteFile: async () => true,
		findDuplicates: async () => {},
		...apiOverrides,
	}

	const Display = loadComponent('src/components/DuplicateFileDisplay.vue', {
		'@/tools/api': api,
		'@/tools/clipboardHelper': loadModule('src/tools/clipboardHelper.js'),
		'@/tools/duplicatePathDiff': loadModule('src/tools/duplicatePathDiff.js'),
		'@/tools/utils': utils,
		'@nextcloud/router': { generateUrl: url => url },
	})

	Vue.component('NcLoadingSpinner', { render: h => h('span') })

	return loadComponent('src/components/DuplicateDetails.vue', {
		'@/tools/api': api,
		'@/tools/utils': utils,
		'@/tools/duplicateSelectionAndExport': selectionAndExport,
		'@/tools/duplicateMetadataBadges': metadataBadges,
		'@/tools/duplicatePathDiff': loadModule('src/tools/duplicatePathDiff.js'),
		'@/tools/deleteSafetyGuard': deleteSafetyGuard,
		'@/tools/duplicateGroupSummary': loadModule('src/tools/duplicateGroupSummary.js'),
		'@/tools/duplicateHashHelper': loadModule('src/tools/duplicateHashHelper.js'),
		'@/tools/clipboardHelper': loadModule('src/tools/clipboardHelper.js'),
		'@nextcloud/dialogs': { showSuccess() {}, showError() {} },
		'./DuplicateCompareView.vue': { __esModule: true, default: { render: h => h('div') } },
		'./DuplicateFileDisplay.vue': { __esModule: true, default: Display },
	})
}

describe('Cycle 41: factual metadata badges for duplicate master identification', () => {
	test('handles empty, null, undefined, and single-file inputs safely', () => {
		const { annotateDuplicateMetadataBadges, getFolderLabel } = loadModule('src/tools/duplicateMetadataBadges.js')

		assert.deepEqual(annotateDuplicateMetadataBadges([]), [])
		assert.deepEqual(annotateDuplicateMetadataBadges(null), [])
		assert.deepEqual(annotateDuplicateMetadataBadges(undefined), [])
		assert.deepEqual(annotateDuplicateMetadataBadges([null, undefined]), [
			{
				isOldest: false,
				isNewest: false,
				isShortestPath: false,
				isProtectedOrigin: false,
				folderLabel: '',
			},
			{
				isOldest: false,
				isNewest: false,
				isShortestPath: false,
				isProtectedOrigin: false,
				folderLabel: '',
			},
		])

		assert.deepEqual(
			annotateDuplicateMetadataBadges([
				{ id: 1, path: '/alice/files/Projects/doc.pdf', mtime: 1000, isInOriginFolder: true },
			]),
			[
				{
					isOldest: false,
					isNewest: false,
					isShortestPath: false,
					isProtectedOrigin: true,
					folderLabel: '/Projects',
				},
			],
		)

		assert.equal(getFolderLabel(''), '')
		assert.equal(getFolderLabel(null), '')
		assert.equal(getFolderLabel('/alice/files/root.txt'), '/')
		assert.equal(getFolderLabel('/alice/files/Photos/2024/img.jpg'), '/Photos/2024')
	})

	test('annotates 2+ files deterministically across timestamps, path lengths, protected origin, and folders', () => {
		const { annotateDuplicateMetadataBadges } = loadModule('src/tools/duplicateMetadataBadges.js')

		const files = [
			{ id: 1, path: '/alice/files/Archive/2023/copy/photo.jpg', mtime: 2000, isInOriginFolder: false },
			{ id: 2, path: '/alice/files/photo.jpg', mtime: 3000, isInOriginFolder: false },
			{ id: 3, path: '/alice/files/Originals/photo.jpg', mtime: 1000, isInOriginFolder: true },
		]

		const badges = annotateDuplicateMetadataBadges(files)
		assert.deepEqual(badges, [
			{
				isOldest: false,
				isNewest: false,
				isShortestPath: false,
				isProtectedOrigin: false,
				folderLabel: '/Archive/2023/copy',
			},
			{
				isOldest: false,
				isNewest: true,
				isShortestPath: true,
				isProtectedOrigin: false,
				folderLabel: '/',
			},
			{
				isOldest: true,
				isNewest: false,
				isShortestPath: false,
				isProtectedOrigin: true,
				folderLabel: '/Originals',
			},
		])

		// Shuffled order produces identical annotations for each corresponding file
		const shuffled = [files[2], files[0], files[1]]
		const shuffledBadges = annotateDuplicateMetadataBadges(shuffled)
		assert.deepEqual(shuffledBadges[0], badges[2])
		assert.deepEqual(shuffledBadges[1], badges[0])
		assert.deepEqual(shuffledBadges[2], badges[1])

		// Supports ISO updatedAt and Date instances
		const isoBadges = annotateDuplicateMetadataBadges([
			{ id: 10, path: '/u/files/a/doc.pdf', updatedAt: '2025-01-01T10:00:00Z' },
			{ id: 11, path: '/u/files/sub/b/doc.pdf', lastModified: new Date('2025-02-01T10:00:00Z') },
		])
		assert.equal(isoBadges[0].isOldest, true)
		assert.equal(isoBadges[0].isNewest, false)
		assert.equal(isoBadges[0].isShortestPath, true)
		assert.equal(isoBadges[1].isOldest, false)
		assert.equal(isoBadges[1].isNewest, true)
		assert.equal(isoBadges[1].isShortestPath, false)
	})

	test('handles date and path length ties without false-positive badges', () => {
		const { annotateDuplicateMetadataBadges } = loadModule('src/tools/duplicateMetadataBadges.js')

		// All dates equal and all path lengths equal -> no oldest/newest/shortest badges
		const allEqual = annotateDuplicateMetadataBadges([
			{ id: 1, path: '/u/files/a/item.txt', mtime: 5000 },
			{ id: 2, path: '/u/files/b/item.txt', mtime: 5000 },
		])
		assert.deepEqual(allEqual, [
			{
				isOldest: false,
				isNewest: false,
				isShortestPath: false,
				isProtectedOrigin: false,
				folderLabel: '/a',
			},
			{
				isOldest: false,
				isNewest: false,
				isShortestPath: false,
				isProtectedOrigin: false,
				folderLabel: '/b',
			},
		])

		// Partial tie: two files share oldest date and shortest path while third is newer and deeper
		const partialTie = annotateDuplicateMetadataBadges([
			{ id: 1, path: '/u/files/a/item.txt', mtime: 1000 },
			{ id: 2, path: '/u/files/b/item.txt', mtime: 1000 },
			{ id: 3, path: '/u/files/deep/c/item.txt', mtime: 9000 },
		])
		assert.equal(partialTie[0].isOldest, true)
		assert.equal(partialTie[0].isNewest, false)
		assert.equal(partialTie[0].isShortestPath, true)

		assert.equal(partialTie[1].isOldest, true)
		assert.equal(partialTie[1].isNewest, false)
		assert.equal(partialTie[1].isShortestPath, true)

		assert.equal(partialTie[2].isOldest, false)
		assert.equal(partialTie[2].isNewest, true)
		assert.equal(partialTie[2].isShortestPath, false)

		// Only 1 timestamped file out of 2 -> cannot declare oldest/newest
		const singleTimestamp = annotateDuplicateMetadataBadges([
			{ id: 1, path: '/u/files/a.bin', mtime: 1000 },
			{ id: 2, path: '/u/files/sub/a.bin' },
		])
		assert.equal(singleTimestamp[0].isOldest, false)
		assert.equal(singleTimestamp[0].isNewest, false)
		assert.equal(singleTimestamp[0].isShortestPath, true)
		assert.equal(singleTimestamp[1].isOldest, false)
		assert.equal(singleTimestamp[1].isNewest, false)
		assert.equal(singleTimestamp[1].isShortestPath, false)
	})

	test('DuplicateDetails + DuplicateFileDisplay render badges declaratively, update on deletion, and escape XSS paths', async () => {
		const Details = createDetailsComponent({
			deleteFile: async () => true,
		})

		const duplicate = {
			id: 55,
			hash: 'hash-badges',
			acknowledged: false,
			files: [
				{
					id: 1,
					nodeId: 101,
					path: '/alice/files/Originals/pic.jpg',
					size: 2048,
					mimetype: 'image/jpeg',
					mtime: 1000,
					isInOriginFolder: true,
				},
				{
					id: 2,
					nodeId: 102,
					path: '/alice/files/pic.jpg',
					size: 2048,
					mimetype: 'image/jpeg',
					mtime: 3000,
					isInOriginFolder: false,
				},
				{
					id: 3,
					nodeId: 103,
					path: '/alice/files/<img src=x onerror=alert(1)>/pic.jpg',
					size: 2048,
					mimetype: 'image/jpeg',
					mtime: 2000,
					isInOriginFolder: false,
				},
			],
		}

		const wrapper = new Vue({
			data() {
				return { duplicate }
			},
			render(h) {
				return h(Details, { props: { duplicate: this.duplicate } })
			},
		}).$mount()
		await settle()

		const rows = Array.from(wrapper.$el.querySelectorAll('.file-display'))
		assert.equal(rows.length, 3)

		// Row 0: Protected origin + Oldest + /Originals
		assert.ok(rows[0].querySelector('.metadata-badge--protected'))
		assert.ok(rows[0].querySelector('.metadata-badge--oldest'))
		assert.equal(rows[0].querySelector('.metadata-badge--newest'), null)
		assert.ok(rows[0].querySelector('.metadata-badge--folder').textContent.includes('/Originals'))

		// Row 1: Newest + Shortest path + /
		assert.ok(rows[1].querySelector('.metadata-badge--newest'))
		assert.ok(rows[1].querySelector('.metadata-badge--shortest'))
		assert.equal(rows[1].querySelector('.metadata-badge--protected'), null)
		assert.ok(rows[1].querySelector('.metadata-badge--folder').textContent.includes('/'))

		// Row 2: XSS folder rendered as plain text, zero injected <img> elements
		const xssBadge = rows[2].querySelector('.metadata-badge--folder')
		assert.ok(xssBadge.textContent.includes('/<img src=x onerror=alert(1)>'))
		assert.equal(wrapper.$el.querySelectorAll('img').length, 0)

		// Deleting row 1 (newest) recomputes badges for remaining 2 files (row 2 becomes newest)
		rows[1].querySelector('.delete-button').click()
		await settle()

		const updatedRows = Array.from(wrapper.$el.querySelectorAll('.file-display'))
		assert.equal(updatedRows.length, 2)
		assert.ok(updatedRows[0].querySelector('.metadata-badge--oldest'))
		assert.ok(updatedRows[0].querySelector('.metadata-badge--shortest'))
		assert.ok(updatedRows[1].querySelector('.metadata-badge--newest'))
		assert.equal(updatedRows[1].querySelector('.metadata-badge--shortest'), null)

		wrapper.$destroy()
	})

	test('metadata badges UI uses 100% logical CSS, mobile wrap, zero v-html, and zero typographic dashes', () => {
		const displaySource = readFileSync(resolve(root, 'src/components/DuplicateFileDisplay.vue'), 'utf8')
		const helperSource = readFileSync(resolve(root, 'src/tools/duplicateMetadataBadges.js'), 'utf8')

		assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(displaySource))
		assert.ok(!/[\u2013\u2014]/.test(displaySource))
		assert.ok(!/[\u2013\u2014]/.test(helperSource))

		const cssStart = displaySource.indexOf('.file-metadata-badges {')
		const cssEnd = displaySource.indexOf('.file-size-column {')
		const badgeCss = displaySource.slice(cssStart, cssEnd)
		assert.ok(badgeCss.includes('flex-wrap: wrap'))
		assert.ok(badgeCss.includes('max-inline-size: 100%'))
		assert.ok(!/(?:margin|padding|border)-(?:left|right|top|bottom)/.test(badgeCss))
	})
})
