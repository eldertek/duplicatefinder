const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

function createDetailsComponent(apiOverrides = {}, clipboardImpl) {
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
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
		'@/tools/clipboardHelper': clipboardHelper,
		'@/tools/duplicatePathDiff': loadModule('src/tools/duplicatePathDiff.js'),
		'@/tools/utils': utils,
		'@nextcloud/router': { generateUrl: url => url },
	})

	Vue.component('NcLoadingSpinner', { render: h => h('span') })

	return loadComponent('src/components/DuplicateDetails.vue', {
		'@/tools/api': api,
		'@/tools/utils': utils,
		'@/tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: {
				copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl),
			},
		'@/tools/duplicateSelectionAndExport': loadModule('src/tools/duplicateSelectionAndExport.js'),
		'@/tools/duplicateMetadataBadges': loadModule('src/tools/duplicateMetadataBadges.js'),
		'@/tools/duplicatePathDiff': loadModule('src/tools/duplicatePathDiff.js'),
		'@/tools/deleteSafetyGuard': loadModule('src/tools/deleteSafetyGuard.js'),
		'@/tools/duplicateGroupSummary': loadModule('src/tools/duplicateGroupSummary.js'),
		'@/tools/duplicateHashHelper': loadModule('src/tools/duplicateHashHelper.js'),
		'@/tools/visualMediaInspector': loadModule('src/tools/visualMediaInspector.js'),
		'@nextcloud/dialogs': { showSuccess() {}, showError() {} },
		'./DuplicateCompareView.vue': { __esModule: true, default: { render: h => h('div') } },
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

describe('Cycle 87: duplicateHashHelper and 1-click Copy hash button in group header summary', () => {
	test('formatShortHash returns lowercase hex prefix and returns empty string for invalid inputs', () => {
		const { formatShortHash } = loadModule('src/tools/duplicateHashHelper.js')

		assert.equal(formatShortHash('D41D8CD98F00B204E9800998ECF8427E'), 'd41d8cd98f00')
		assert.equal(formatShortHash('  ABCDEF0123456789  ', 8), 'abcdef01')
		assert.equal(formatShortHash('AbCd12', 12), 'abcd12')
		assert.equal(formatShortHash('0123456789abcdef', 6.8), '012345')

		assert.equal(formatShortHash(''), '')
		assert.equal(formatShortHash('   '), '')
		assert.equal(formatShortHash(null), '')
		assert.equal(formatShortHash(undefined), '')
		assert.equal(formatShortHash(123456), '')
		assert.equal(formatShortHash({}), '')
		assert.equal(formatShortHash('not-a-hex-hash'), '')
		assert.equal(formatShortHash('0xabcdef123456'), '')
		assert.equal(formatShortHash('abcdef123456', 0), '')
		assert.equal(formatShortHash('abcdef123456', -4), '')
		assert.equal(formatShortHash('abcdef123456', Number.NaN), '')
		assert.equal(formatShortHash('abcdef123456', Number.POSITIVE_INFINITY), '')
		assert.equal(formatShortHash('abcdef123456', null), '')
	})

	test('DuplicateDetails renders Copy hash button in .group-header-summary, copies full hash, and announces via aria-live polite', async () => {
		const copiedValues = []
		const Details = createDetailsComponent({}, {
			writeText: async value => {
				copiedValues.push(value)
			},
		})
		const fullHash = '  D41D8CD98F00B204E9800998ECF8427E  '

		const wrapper = new Vue({
			data: {
				duplicate: {
					id: 21,
					hash: fullHash,
					acknowledged: false,
					files: [
						{ id: 1, nodeId: 11, path: '/alice/files/a/photo.jpg', mimetype: 'image/jpeg', size: 1024, isInOriginFolder: false },
						{ id: 2, nodeId: 12, path: '/alice/files/b/photo.jpg', mimetype: 'image/jpeg', size: 1024, isInOriginFolder: false },
					],
				},
			},
			render(h) {
				return h(Details, { props: { duplicate: this.duplicate } })
			},
		}).$mount()
		await settle()

		const banner = wrapper.$el.querySelector('.group-header-summary')
		const button = banner.querySelector('button.group-header-summary__copy-hash-button')
		const code = banner.querySelector('.group-header-summary__hash-code')
		const status = banner.querySelector('.group-header-summary__copy-status')

		assert.ok(button, 'renders Copy hash button inside .group-header-summary')
		assert.equal(button.getAttribute('type'), 'button')
		assert.equal(button.disabled, false)
		assert.ok(button.textContent.includes('Copy hash'))
		assert.equal(button.getAttribute('aria-label'), 'Copy hash (d41d8cd98f00)')
		assert.ok(code, 'renders readable short hex prefix')
		assert.equal(code.textContent.trim(), 'd41d8cd98f00')

		assert.ok(status, 'renders aria-live status element')
		assert.equal(status.getAttribute('role'), 'status')
		assert.equal(status.getAttribute('aria-live'), 'polite')
		assert.equal(status.textContent.trim(), '')

		button.click()
		await settle()

		assert.deepEqual(copiedValues, ['D41D8CD98F00B204E9800998ECF8427E'])
		assert.equal(status.textContent.trim(), 'Copied')
		assert.equal(button.classList.contains('is-copied'), true)

		// Switching duplicate resets copy status feedback
		wrapper.duplicate = {
			id: 22,
			hash: '00112233445566778899aabbccddeeff',
			acknowledged: false,
			files: [
				{ id: 3, nodeId: 13, path: '/alice/files/c/doc.pdf', mimetype: 'application/pdf', size: 2048, isInOriginFolder: false },
				{ id: 4, nodeId: 14, path: '/alice/files/d/doc.pdf', mimetype: 'application/pdf', size: 2048, isInOriginFolder: false },
			],
		}
		await settle()

		assert.equal(status.textContent.trim(), '')
		assert.equal(button.classList.contains('is-copied'), false)
		assert.equal(banner.querySelector('.group-header-summary__hash-code').textContent.trim(), '001122334455')

		wrapper.$destroy()
	})

	test('DuplicateDetails Copy hash announces Copy failed on clipboard error and disables when hash is missing', async () => {
		const FailingDetails = createDetailsComponent({}, {
			writeText: async () => {
				throw new Error('Clipboard denied')
			},
		})

		const failingWrapper = new Vue({
			render(h) {
				return h(FailingDetails, {
					props: {
						duplicate: {
							id: 31,
							hash: 'abcdef0123456789',
							acknowledged: false,
							files: [
								{ id: 1, nodeId: 11, path: '/u/files/a.bin', mimetype: 'application/octet-stream', size: 512, isInOriginFolder: false },
								{ id: 2, nodeId: 12, path: '/u/files/b.bin', mimetype: 'application/octet-stream', size: 512, isInOriginFolder: false },
							],
						},
					},
				})
			},
		}).$mount()
		await settle()

		const failButton = failingWrapper.$el.querySelector('button.group-header-summary__copy-hash-button')
		const failStatus = failingWrapper.$el.querySelector('.group-header-summary__copy-status')
		failButton.click()
		await settle()

		assert.equal(failStatus.textContent.trim(), 'Copy failed')
		assert.equal(failButton.classList.contains('is-error'), true)
		failingWrapper.$destroy()

		const EmptyHashDetails = createDetailsComponent({}, { writeText: async () => {} })
		const emptyHashWrapper = new Vue({
			render(h) {
				return h(EmptyHashDetails, {
					props: {
						duplicate: {
							id: 32,
							hash: '   ',
							acknowledged: false,
							files: [
								{ id: 1, nodeId: 11, path: '/u/files/a.bin', mimetype: 'application/octet-stream', size: 512, isInOriginFolder: false },
								{ id: 2, nodeId: 12, path: '/u/files/b.bin', mimetype: 'application/octet-stream', size: 512, isInOriginFolder: false },
							],
						},
					},
				})
			},
		}).$mount()
		await settle()

		const disabledButton = emptyHashWrapper.$el.querySelector('button.group-header-summary__copy-hash-button')
		assert.equal(disabledButton.disabled, true)
		assert.equal(emptyHashWrapper.$el.querySelector('.group-header-summary__hash-code'), null)
		emptyHashWrapper.$destroy()
	})

	test('duplicateHashHelper.js and Copy hash CSS follow >= 44px targets, focus-visible, logical properties, zero XSS, and zero dashes', () => {
		const helperSource = readFileSync(resolve(root, 'src/tools/duplicateHashHelper.js'), 'utf8')
		const detailsSource = readFileSync(resolve(root, 'src/components/DuplicateDetails.vue'), 'utf8')

		for (const source of [helperSource, detailsSource]) {
			assert.ok(!/[\u2013\u2014]/.test(source), 'has zero U+2013/U+2014 dashes')
			assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(source), 'has zero XSS sinks')
		}

		const cssStart = detailsSource.indexOf('.group-header-summary {')
		const cssEnd = detailsSource.indexOf('.summary-section {', cssStart)
		const bannerCss = detailsSource.slice(cssStart, cssEnd)

		assert.ok(bannerCss.includes('.group-header-summary__copy-hash-button:focus-visible'), 'Copy hash button styles :focus-visible')
		assert.ok(bannerCss.includes('min-inline-size: 44px;'), 'Copy hash button enforces >= 44px inline target')
		assert.ok(bannerCss.includes('min-block-size: 44px;'), 'Copy hash button enforces >= 44px block target')
		assert.ok(!/(?:margin|padding|border)-(?:left|right|top|bottom)/.test(bannerCss), 'banner CSS uses 100% logical properties')
	})
})
