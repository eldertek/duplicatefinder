const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, document, window } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

function createDetailsWithCompare() {
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const pathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const stats = loadModule('src/tools/duplicateStats.js')
	const compare = loadModule('src/tools/duplicateCompare.js', {
		'./duplicatePathDiff': pathDiff,
	})
	const api = {
		acknowledgeDuplicate: async () => {},
		unacknowledgeDuplicate: async () => {},
		deleteFiles: async files => ({ success: [...files], errors: [] }),
		deleteFile: async () => true,
		findDuplicates: async () => {},
	}

	const Display = loadComponent('src/components/DuplicateFileDisplay.vue', {
		'@/tools/api': api,
		'@/tools/clipboardHelper': clipboardHelper,
		'@/tools/duplicatePathDiff': pathDiff,
		'@/tools/utils': utils,
		'@nextcloud/router': { generateUrl: url => url },
	})

	const CompareView = loadComponent('src/components/DuplicateCompareView.vue', {
		'@nextcloud/router': { generateUrl: url => url },
		'../tools/clipboardHelper': clipboardHelper,
		'../tools/duplicateCompare': compare,
		'../tools/duplicateStats': stats,
		'../tools/utils': utils,
	})

	Vue.component('NcLoadingSpinner', { render: h => h('span') })

	return loadComponent('src/components/DuplicateDetails.vue', {
		'@/tools/api': api,
		'@/tools/utils': utils,
		'@/tools/duplicateSelectionAndExport': loadModule('src/tools/duplicateSelectionAndExport.js'),
		'@/tools/duplicateMetadataBadges': loadModule('src/tools/duplicateMetadataBadges.js'),
		'@/tools/duplicatePathDiff': pathDiff,
		'@/tools/deleteSafetyGuard': loadModule('src/tools/deleteSafetyGuard.js'),
		'@/tools/duplicateGroupSummary': loadModule('src/tools/duplicateGroupSummary.js'),
		'@/tools/duplicateHashHelper': loadModule('src/tools/duplicateHashHelper.js'),
		'@/tools/clipboardHelper': clipboardHelper,
		'@nextcloud/dialogs': { showSuccess() {}, showError() {} },
		'./DuplicateCompareView.vue': { __esModule: true, default: CompareView },
		'./DuplicateFileDisplay.vue': { __esModule: true, default: Display },
	})
}

describe('Cycle 114: Beyond Compare side-by-side visual comparison view', () => {
	test('duplicateCompare helpers compute smart default pairs, bounded clamping, and metadata diffs', () => {
		const pathDiff = loadModule('src/tools/duplicatePathDiff.js')
		const {
			isVisualPreviewableMimetype,
			extractFileDisplayMeta,
			pickDefaultComparisonPair,
			clampComparisonPair,
			computeSideBySideDiffRows,
		} = loadModule('src/tools/duplicateCompare.js', {
			'./duplicatePathDiff': pathDiff,
		})

		assert.equal(isVisualPreviewableMimetype('image/jpeg'), true)
		assert.equal(isVisualPreviewableMimetype('video/mp4'), true)
		assert.equal(isVisualPreviewableMimetype('application/pdf'), false)
		assert.equal(isVisualPreviewableMimetype(null), false)

		assert.deepEqual(pickDefaultComparisonPair(null), { leftIndex: 0, rightIndex: 0 })
		assert.deepEqual(pickDefaultComparisonPair([{ path: '/alice/files/a.jpg' }]), { leftIndex: 0, rightIndex: 0 })

		const files = [
			{ id: 1, path: '/alice/files/Backups/IMG_01.jpg', size: 2048, mtime: 1700000100, mimetype: 'image/jpeg', isInOriginFolder: false },
			{ id: 2, path: '/alice/files/Origin/IMG_01.jpg', size: 2048, mtime: 1700000000, mimetype: 'image/jpeg', isInOriginFolder: true },
			{ id: 3, path: '/alice/files/Exports/IMG_01-copy.jpg', size: 2048, mtime: 1700000200, mimetype: 'image/jpeg', isInOriginFolder: false },
		]

		// Protected origin file (index 1) should be prioritized as Left reference
		assert.deepEqual(pickDefaultComparisonPair(files), { leftIndex: 1, rightIndex: 0 })

		// When index 2 is selected for deletion, Right should jump to index 2
		assert.deepEqual(
			pickDefaultComparisonPair(files, { isSelected: file => file.id === 3 }),
			{ leftIndex: 1, rightIndex: 2 },
		)

		// Clamping protects against shrinking arrays and colliding indices
		assert.deepEqual(clampComparisonPair(files, 99, 99), { leftIndex: 2, rightIndex: 0 })
		assert.deepEqual(clampComparisonPair(files.slice(0, 2), 1, 1), { leftIndex: 1, rightIndex: 0 })

		const meta = extractFileDisplayMeta(files[0], { formatSize: b => `${b} B` })
		assert.equal(meta.normalizedPath, '/Backups/IMG_01.jpg')
		assert.equal(meta.folder, '/Backups')
		assert.equal(meta.fileName, 'IMG_01.jpg')
		assert.equal(meta.sizeBytes, 2048)
		assert.equal(meta.isProtected, false)

		const diff = computeSideBySideDiffRows(files[1], files[2], {
			formatSize: b => `${b} B`,
			leftStatus: 'Protected',
			rightStatus: 'Will delete',
		})
		const diffKeys = diff.rows.filter(r => r.isDiff).map(r => r.key)
		assert.deepEqual(diffKeys, ['fileName', 'folder', 'modifiedAt', 'status'])
		assert.equal(diff.diffCount, 4)

		const identical = computeSideBySideDiffRows(files[1], files[1], {
			formatSize: b => `${b} B`,
			leftStatus: 'Protected',
			rightStatus: 'Protected',
		})
		assert.equal(identical.diffCount, 0)
	})

	test('DuplicateDetails toggles Compare view, shows Beyond Compare diffs, swaps sides, and updates selection safely', async () => {
		const Details = createDetailsWithCompare()
		const originalNavigatorDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
		let copiedText = ''
		Object.defineProperty(globalThis, 'navigator', {
			configurable: true,
			value: {
				clipboard: {
					writeText: async text => {
						copiedText = text
					},
				},
			},
		})

		const duplicate = {
			id: 501,
			hash: 'deadbeef12345678',
			acknowledged: false,
			files: [
				{
					id: 11,
					nodeId: 211,
					path: '/alice/files/Archive/2024/IMG_01.jpg',
					size: 4096,
					mtime: 1700000100,
					mimetype: 'image/jpeg',
					isInOriginFolder: false,
				},
				{
					id: 12,
					nodeId: 212,
					path: '/alice/files/Origin/2024/IMG_01.jpg',
					size: 4096,
					mtime: 1700000000,
					mimetype: 'image/jpeg',
					isInOriginFolder: true,
				},
				{
					id: 13,
					nodeId: 213,
					path: '/alice/files/Temp/IMG_01_dup.jpg',
					size: 4096,
					mtime: 1700000200,
					mimetype: 'image/jpeg',
					isInOriginFolder: false,
				},
			],
		}

		const wrapper = new Vue({
			data: { duplicate },
			render(h) {
				return h(Details, { props: { duplicate: this.duplicate } })
			},
		}).$mount()
		document.body.appendChild(wrapper.$el)

		try {
			await settle()
			const detailsVm = wrapper.$children[0]
			const compareButton = detailsVm.$el.querySelector('.compare-toggle-button')
			assert.ok(compareButton, 'Compare toggle button exists')
			assert.equal(compareButton.getAttribute('aria-pressed'), 'false')
			assert.equal(compareButton.getAttribute('aria-keyshortcuts'), 'v')
			assert.equal(detailsVm.$el.querySelector('.compare-workspace'), null)

			// Enter compare mode
			compareButton.click()
			await settle()

			assert.equal(compareButton.getAttribute('aria-pressed'), 'true')
			const workspace = detailsVm.$el.querySelector('.compare-workspace')
			assert.ok(workspace, 'compare workspace renders')
			assert.equal(detailsVm.$el.querySelector('.files-card'), null, 'list view hides when compare mode active')

			const panes = Array.from(workspace.querySelectorAll('.compare-pane'))
			assert.equal(panes.length, 2)

			// Left defaults to Protected origin (index 1), Right defaults to first deletable (index 0)
			const leftSelect = panes[0].querySelector('.compare-pane__select')
			const rightSelect = panes[1].querySelector('.compare-pane__select')
			assert.equal(leftSelect.value, '1')
			assert.equal(rightSelect.value, '0')
			assert.ok(panes[0].querySelector('.compare-pane__protected-note'), 'protected origin pane shows protected note')

			// Path diffs highlight differing folder segments cleanly
			const leftDiffSegs = Array.from(panes[0].querySelectorAll('.file-path-segment--diff')).map(el => el.textContent)
			const rightDiffSegs = Array.from(panes[1].querySelectorAll('.file-path-segment--diff')).map(el => el.textContent)
			assert.ok(leftDiffSegs.some(text => text.includes('Origin')))
			assert.ok(rightDiffSegs.some(text => text.includes('Archive')))

			// Triage button on Right pane marks index 0 for deletion and updates live deletion plan
			const rightTriageBtn = panes[1].querySelector('.compare-pane__triage-button')
			assert.equal(rightTriageBtn.getAttribute('aria-pressed'), 'false')
			rightTriageBtn.click()
			await settle()
			assert.equal(rightTriageBtn.getAttribute('aria-pressed'), 'true')
			assert.equal(detailsVm.selectedFiles.length, 1)
			assert.equal(detailsVm.selectedFiles[0].id, 11)
			assert.ok(detailsVm.$el.querySelector('.deletion-safety-summary'))

			// Switch Right copy select to index 2 (different filename)
			rightSelect.value = '2'
			rightSelect.dispatchEvent(new window.Event('change', { bubbles: true }))
			await settle()
			assert.equal(rightSelect.value, '2')
			assert.ok(panes[1].textContent.includes('IMG_01_dup.jpg'))

			// Swap sides reverses Left (1) and Right (2)
			const swapButton = workspace.querySelector('.compare-swap-button')
			swapButton.click()
			await settle()
			assert.equal(leftSelect.value, '2')
			assert.equal(rightSelect.value, '1')

			// Copy path button in Left pane copies normalized path safely
			const copyPathBtn = panes[0].querySelector('.compare-copy-path-button')
			copyPathBtn.click()
			await settle()
			assert.equal(copiedText, '/Temp/IMG_01_dup.jpg')
			assert.equal(panes[0].querySelector('.compare-pane__copy-status').textContent.trim(), 'Copied')

			// Switching duplicate group keeps indices bounded cleanly
			wrapper.duplicate = {
				id: 502,
				hash: 'cafebabe',
				acknowledged: false,
				files: [
					{ id: 21, nodeId: 321, path: '/alice/files/A/x.jpg', size: 100, mimetype: 'image/jpeg', isInOriginFolder: false },
					{ id: 22, nodeId: 322, path: '/alice/files/B/x.jpg', size: 100, mimetype: 'image/jpeg', isInOriginFolder: false },
				],
			}
			await settle()
			assert.equal(leftSelect.value, '0')
			assert.equal(rightSelect.value, '1')

			// Close compare returns to list view
			workspace.querySelector('.compare-close-button').click()
			await settle()
			assert.equal(detailsVm.compareMode, false)
			assert.ok(detailsVm.$el.querySelector('.files-card'))
		} finally {
			if (originalNavigatorDesc) {
				Object.defineProperty(globalThis, 'navigator', originalNavigatorDesc)
			} else {
				delete globalThis.navigator
			}
			wrapper.$destroy()
			wrapper.$el.remove()
		}
	})

	test('DuplicateCompareView renders malicious filenames as plain text with zero XSS injection', async () => {
		const Details = createDetailsWithCompare()
		const payload = '<img src=x onerror=alert(1)>'
		const duplicate = {
			id: 503,
			hash: 'xss-test-hash',
			acknowledged: false,
			files: [
				{ id: 31, nodeId: 431, path: `/alice/files/One/${payload}.png`, size: 512, mimetype: 'image/png', isInOriginFolder: false },
				{ id: 32, nodeId: 432, path: `/alice/files/Two/${payload}.png`, size: 512, mimetype: 'image/png', isInOriginFolder: false },
			],
		}
		const wrapper = new Vue({
			render(h) {
				return h(Details, { props: { duplicate } })
			},
		}).$mount()
		document.body.appendChild(wrapper.$el)

		try {
			await settle()
			wrapper.$children[0].toggleCompareMode()
			await settle()
			const workspace = wrapper.$el.querySelector('.compare-workspace')
			assert.ok(workspace)
			assert.equal(workspace.querySelectorAll('img[src="x"]').length, 0)
			assert.ok(workspace.textContent.includes(payload))
		} finally {
			wrapper.$destroy()
			wrapper.$el.remove()
		}
	})

	test('Cycle 114 files enforce zero typographic dashes, zero XSS sinks, logical CSS, and >= 44px touch targets', () => {
		const filesToCheck = [
			'src/tools/duplicateCompare.js',
			'src/components/DuplicateCompareView.vue',
			'src/components/DuplicateDetails.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]

		for (const relPath of filesToCheck) {
			const source = readFileSync(resolve(root, relPath), 'utf8')
			assert.ok(!/[\u2013\u2014]/.test(source), `${relPath} has zero U+2013/U+2014 dashes`)
			assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(source), `${relPath} has zero XSS sinks`)
		}

		const compareVue = readFileSync(resolve(root, 'src/components/DuplicateCompareView.vue'), 'utf8')
		assert.ok(compareVue.includes('minmax(0, 1fr)'), 'uses minmax(0, 1fr) grid anti-overflow')
		assert.ok(compareVue.includes('min-block-size: 44px'), 'enforces >= 44px touch targets')
		assert.ok(compareVue.includes(':focus-visible'), 'exposes focus-visible rings')
	})

	test('Cycle 115: filterComparisonDiffRows and Diffs only toggle isolate differing metadata cleanly', async () => {
		const pathDiff = loadModule('src/tools/duplicatePathDiff.js')
		const {
			computeSideBySideDiffRows,
			filterComparisonDiffRows,
		} = loadModule('src/tools/duplicateCompare.js', {
			'./duplicatePathDiff': pathDiff,
		})

		assert.deepEqual(filterComparisonDiffRows(null, true), [])
		const sampleRows = [
			{ key: 'fileName', leftValue: 'a.jpg', rightValue: 'a.jpg', isDiff: false },
			{ key: 'folder', leftValue: '/A', rightValue: '/B', isDiff: true },
			{ key: 'size', leftValue: '100 B', rightValue: '100 B', isDiff: false },
		]
		assert.equal(filterComparisonDiffRows(sampleRows, false).length, 3)
		assert.deepEqual(
			filterComparisonDiffRows(sampleRows, true).map(row => row.key),
			['folder'],
		)

		const Details = createDetailsWithCompare()
		const duplicate = {
			id: 504,
			hash: 'diffs-only-hash',
			acknowledged: false,
			files: [
				{ id: 41, nodeId: 541, path: '/alice/files/Origin/photo.jpg', size: 2048, mtime: 1700000000, mimetype: 'image/jpeg', isInOriginFolder: true },
				{ id: 42, nodeId: 542, path: '/alice/files/Backups/photo.jpg', size: 2048, mtime: 1700000000, mimetype: 'image/jpeg', isInOriginFolder: false },
			],
		}
		const identicalPair = computeSideBySideDiffRows(duplicate.files[0], duplicate.files[0], {
			leftStatus: 'Protected',
			rightStatus: 'Protected',
		})
		assert.deepEqual(filterComparisonDiffRows(identicalPair.rows, true), [])

		const wrapper = new Vue({
			render(h) {
				return h(Details, { props: { duplicate } })
			},
		}).$mount()
		document.body.appendChild(wrapper.$el)

		try {
			await settle()
			wrapper.$children[0].toggleCompareMode()
			await settle()

			const workspace = wrapper.$el.querySelector('.compare-workspace')
			const diffsOnlyBtn = workspace.querySelector('.compare-diffs-only-button')
			assert.ok(diffsOnlyBtn, 'Diffs only toggle button is rendered')
			assert.equal(diffsOnlyBtn.getAttribute('aria-pressed'), 'false')

			const leftPane = workspace.querySelector('.compare-pane--left')
			assert.equal(leftPane.querySelectorAll('.compare-diff-row').length, 6)

			diffsOnlyBtn.click()
			await settle()
			assert.equal(diffsOnlyBtn.getAttribute('aria-pressed'), 'true')
			const filteredKeys = Array.from(leftPane.querySelectorAll('.compare-diff-row')).map(
				row => row.querySelector('.compare-diff-row__label').textContent,
			)
			assert.equal(filteredKeys.length, 2)
			assert.ok(filteredKeys.some(label => label.includes('Folder')))
			assert.ok(filteredKeys.some(label => label.includes('Status')))

			// Selecting identical file on both sides via same-copy fallback shows sober no-diffs status
			const compareVm = wrapper.$children[0].$children.find(child => child.$options.name === 'DuplicateCompareView')
			assert.ok(compareVm)
			compareVm.leftIndex = 0
			compareVm.rightIndex = 0
			assert.equal(leftPane.querySelectorAll('.compare-diff-row').length, 2)

			diffsOnlyBtn.click()
			await settle()
			assert.equal(diffsOnlyBtn.getAttribute('aria-pressed'), 'false')
			assert.equal(leftPane.querySelectorAll('.compare-diff-row').length, 6)
		} finally {
			wrapper.$destroy()
			wrapper.$el.remove()
		}
	})
})
