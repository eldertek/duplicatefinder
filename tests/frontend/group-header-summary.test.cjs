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
	const api = {
		acknowledgeDuplicate: async () => {},
		unacknowledgeDuplicate: async () => {},
		deleteFiles: async files => ({ success: [...files], errors: [] }),
		deleteFile: async () => true,
		findDuplicates: async () => {},
		...apiOverrides,
	}

	const Display = loadComponent('src/components/DuplicateFileDisplay.vue', {
		'@/tools/api': api,
		'@/tools/clipboardHelper': loadModule('src/tools/clipboardHelper.js'),
		'@/tools/utils': utils,
		'@nextcloud/router': { generateUrl: url => url },
	})

	Vue.component('NcLoadingSpinner', { render: h => h('span') })

	return loadComponent('src/components/DuplicateDetails.vue', {
		'@/tools/api': api,
		'@/tools/utils': utils,
		'@/tools/duplicateSelectionAndExport': loadModule('src/tools/duplicateSelectionAndExport.js'),
		'@/tools/duplicateMetadataBadges': loadModule('src/tools/duplicateMetadataBadges.js'),
		'@/tools/deleteSafetyGuard': loadModule('src/tools/deleteSafetyGuard.js'),
		'@/tools/duplicateGroupSummary': loadModule('src/tools/duplicateGroupSummary.js'),
		'@nextcloud/dialogs': { showSuccess() {}, showError() {} },
		'./DuplicateFileDisplay.vue': { __esModule: true, default: Display },
	})
}

describe('Cycle 55: computeGroupHeaderSummary and DuplicateDetails compact header banner', () => {
	test('computeGroupHeaderSummary handles null, undefined, empty, and malformed inputs safely', () => {
		const { computeGroupHeaderSummary } = loadModule('src/tools/duplicateGroupSummary.js')

		const emptySummary = {
			totalCopies: 0,
			redundantCopies: 0,
			unitSizeBytes: 0,
			reclaimableBytes: 0,
			reclaimableFormatted: '0 B',
			protectedCount: 0,
		}

		assert.deepEqual(computeGroupHeaderSummary(null), emptySummary)
		assert.deepEqual(computeGroupHeaderSummary(undefined), emptySummary)
		assert.deepEqual(computeGroupHeaderSummary('not-an-array'), emptySummary)
		assert.deepEqual(computeGroupHeaderSummary({}), emptySummary)
		assert.deepEqual(computeGroupHeaderSummary([]), emptySummary)
		assert.deepEqual(computeGroupHeaderSummary([null, undefined, 'bad', 42]), emptySummary)
	})

	test('computeGroupHeaderSummary computes single-file, multi-copy, protected count, and byte units accurately', () => {
		const { computeGroupHeaderSummary } = loadModule('src/tools/duplicateGroupSummary.js')
		const MB = 1024 * 1024
		const GB = 1024 * MB

		// Single copy has 0 redundant copies and 0 B reclaimable
		assert.deepEqual(
			computeGroupHeaderSummary([
				{ id: 1, path: '/u/files/solo.jpg', size: 2048, isInOriginFolder: true },
			]),
			{
				totalCopies: 1,
				redundantCopies: 0,
				unitSizeBytes: 2048,
				reclaimableBytes: 0,
				reclaimableFormatted: '0 B',
				protectedCount: 1,
			},
		)

		// Three copies of 1.5 MB with one protected origin copy -> 2 redundant = 3 MB reclaimable
		assert.deepEqual(
			computeGroupHeaderSummary([
				{ id: 1, path: '/u/files/Origin/a.mp4', size: 1.5 * MB, isInOriginFolder: true },
				{ id: 2, path: '/u/files/Copy1/a.mp4', size: 1.5 * MB, isInOriginFolder: false },
				{ id: 3, path: '/u/files/Copy2/a.mp4', size: 1.5 * MB, isInOriginFolder: false },
			]),
			{
				totalCopies: 3,
				redundantCopies: 2,
				unitSizeBytes: Math.floor(1.5 * MB),
				reclaimableBytes: 3 * MB,
				reclaimableFormatted: '3 MB',
				protectedCount: 1,
			},
		)

		// Falls back to next valid positive file size and ignores negative/NaN sizes
		assert.deepEqual(
			computeGroupHeaderSummary([
				{ id: 1, path: '/u/files/a.bin', size: -10 },
				{ id: 2, path: '/u/files/b.bin', size: Number.NaN },
				{ id: 3, path: '/u/files/c.bin', size: GB },
			]),
			{
				totalCopies: 3,
				redundantCopies: 2,
				unitSizeBytes: GB,
				reclaimableBytes: 2 * GB,
				reclaimableFormatted: '2 GB',
				protectedCount: 0,
			},
		)
	})

	test('DuplicateDetails renders compact header summary banner with copies, reclaimable space, and conditional protected pill', async () => {
		const Details = createDetailsComponent()
		const MB = 1024 * 1024

		const wrapper = new Vue({
			data: {
				duplicate: {
					id: 10,
					hash: 'hash-unprotected',
					acknowledged: false,
					files: [
						{ id: 1, nodeId: 11, path: '/alice/files/a/photo.jpg', mimetype: 'image/jpeg', size: 2 * MB, isInOriginFolder: false },
						{ id: 2, nodeId: 12, path: '/alice/files/b/photo.jpg', mimetype: 'image/jpeg', size: 2 * MB, isInOriginFolder: false },
					],
				},
			},
			render(h) {
				return h(Details, { props: { duplicate: this.duplicate } })
			},
		}).$mount()
		await settle()

		const banner = wrapper.$el.querySelector('.group-header-summary')
		assert.ok(banner, 'renders compact group header summary banner')
		assert.equal(banner.getAttribute('role'), 'region')
		assert.ok(banner.getAttribute('aria-label'), 'banner exposes an aria-label')

		const copiesEl = banner.querySelector('.group-header-summary__item--copies')
		const reclaimableEl = banner.querySelector('.group-header-summary__item--reclaimable')
		assert.ok(copiesEl.textContent.includes('2 copies (1 redundant)'))
		assert.ok(reclaimableEl.textContent.includes('2 MB reclaimable'))
		assert.equal(banner.querySelector('.group-header-summary__item--protected'), null, 'omits protected pill when protectedCount is 0')

		// Switch to a group with 4 copies including 2 protected copies
		wrapper.duplicate = {
			id: 11,
			hash: 'hash-protected',
			acknowledged: false,
			files: [
				{ id: 21, nodeId: 31, path: '/alice/files/origin1/doc.pdf', mimetype: 'application/pdf', size: 512 * 1024, isInOriginFolder: true },
				{ id: 22, nodeId: 32, path: '/alice/files/origin2/doc.pdf', mimetype: 'application/pdf', size: 512 * 1024, isInOriginFolder: true },
				{ id: 23, nodeId: 33, path: '/alice/files/tmp/doc.pdf', mimetype: 'application/pdf', size: 512 * 1024, isInOriginFolder: false },
				{ id: 24, nodeId: 34, path: '/alice/files/old/doc.pdf', mimetype: 'application/pdf', size: 512 * 1024, isInOriginFolder: false },
			],
		}
		await settle()

		const updatedBanner = wrapper.$el.querySelector('.group-header-summary')
		assert.ok(updatedBanner.querySelector('.group-header-summary__item--copies').textContent.includes('4 copies (3 redundant)'))
		assert.ok(updatedBanner.querySelector('.group-header-summary__item--reclaimable').textContent.includes('1.5 MB reclaimable'))
		const protectedEl = updatedBanner.querySelector('.group-header-summary__item--protected')
		assert.ok(protectedEl, 'renders protected pill when protectedCount > 0')
		assert.ok(protectedEl.textContent.includes('2 protected'))

		wrapper.$destroy()
	})

	test('group header summary helper and DuplicateDetails CSS follow logical properties, mobile wrap, zero XSS, and zero dashes', () => {
		const helperSource = readFileSync(resolve(root, 'src/tools/duplicateGroupSummary.js'), 'utf8')
		const detailsSource = readFileSync(resolve(root, 'src/components/DuplicateDetails.vue'), 'utf8')

		assert.ok(!/[\u2013\u2014]/.test(helperSource), 'duplicateGroupSummary.js has zero U+2013/U+2014 dashes')
		assert.ok(!/[\u2013\u2014]/.test(detailsSource), 'DuplicateDetails.vue has zero U+2013/U+2014 dashes')
		assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(helperSource), 'duplicateGroupSummary.js has zero XSS sinks')
		assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(detailsSource), 'DuplicateDetails.vue has zero XSS sinks')

		const cssStart = detailsSource.indexOf('.group-header-summary {')
		const cssEnd = detailsSource.indexOf('.summary-section {', cssStart)
		const bannerCss = detailsSource.slice(cssStart, cssEnd)
		assert.ok(bannerCss.includes('flex-wrap: wrap;'), 'banner wraps cleanly at 375px')
		assert.ok(bannerCss.includes('max-inline-size: 100%;'), 'banner constrains inline size for 375px mobile')
		assert.ok(bannerCss.includes('overflow-wrap: anywhere;'), 'banner items wrap long content safely')
		assert.ok(!/(?:margin|padding|border)-(?:left|right|top|bottom)/.test(bannerCss), 'banner CSS uses 100% logical properties')
	})
})
