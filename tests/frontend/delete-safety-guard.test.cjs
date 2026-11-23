const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, document } = require('./helpers.cjs')

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
		deleteFiles: async files => ({ success: [...files], errors: [] }),
		deleteFile: async () => true,
		findDuplicates: async () => {},
		...apiOverrides,
	}

	const Display = loadComponent('src/components/DuplicateFileDisplay.vue', {
		'@/tools/api': api,
		'@/tools/utils': utils,
		'@nextcloud/router': { generateUrl: url => url },
	})

	Vue.component('NcLoadingSpinner', { render: h => h('span') })

	return loadComponent('src/components/DuplicateDetails.vue', {
		'@/tools/api': api,
		'@/tools/utils': utils,
		'@/tools/duplicateSelectionAndExport': selectionAndExport,
		'@/tools/duplicateMetadataBadges': metadataBadges,
		'@/tools/deleteSafetyGuard': deleteSafetyGuard,
		'@nextcloud/dialogs': { showSuccess() {}, showError() {} },
		'./DuplicateFileDisplay.vue': { __esModule: true, default: Display },
	})
}

describe('Cycle 43: deleteSafetyGuard and DuplicateDetails anti-accidental-deletion confirmation', () => {
	test('evaluateDeletionPlan handles empty and degenerate inputs safely', () => {
		const { evaluateDeletionPlan } = loadModule('src/tools/deleteSafetyGuard.js')

		const groupFiles = [
			{ id: 1, path: '/alice/files/a/photo.jpg', size: 2048, isInOriginFolder: false },
			{ id: 2, path: '/alice/files/b/photo.jpg', size: 2048, isInOriginFolder: false },
		]

		assert.deepEqual(evaluateDeletionPlan(groupFiles, []), {
			selectedCount: 0,
			survivingCount: 2,
			reclaimableBytes: 0,
			reclaimableFormatted: '0 B',
			wouldDeleteAllCopies: false,
			includesProtectedOrigin: false,
			canProceedSafely: false,
			targetPaths: [],
		})

		assert.deepEqual(evaluateDeletionPlan([], []), {
			selectedCount: 0,
			survivingCount: 0,
			reclaimableBytes: 0,
			reclaimableFormatted: '0 B',
			wouldDeleteAllCopies: false,
			includesProtectedOrigin: false,
			canProceedSafely: false,
			targetPaths: [],
		})

		assert.deepEqual(evaluateDeletionPlan(null, new Set(['missing'])), {
			selectedCount: 0,
			survivingCount: 0,
			reclaimableBytes: 0,
			reclaimableFormatted: '0 B',
			wouldDeleteAllCopies: false,
			includesProtectedOrigin: false,
			canProceedSafely: false,
			targetPaths: [],
		})
	})

	test('evaluateDeletionPlan marks partial non-protected selection as safe and computes exact bytes', () => {
		const { evaluateDeletionPlan } = loadModule('src/tools/deleteSafetyGuard.js')

		const groupFiles = [
			{ id: 10, path: '/alice/files/keep/video.mp4', size: 1572864, isInOriginFolder: false },
			{ id: 11, path: '/alice/files/dup1/video.mp4', size: 1572864, isInOriginFolder: false },
			{ id: 12, path: '/alice/files/dup2/video.mp4', size: 1572864, isInOriginFolder: false },
		]

		const plan = evaluateDeletionPlan(groupFiles, new Set([11, 12]))
		assert.deepEqual(plan, {
			selectedCount: 2,
			survivingCount: 1,
			reclaimableBytes: 3145728,
			reclaimableFormatted: '3 MB',
			wouldDeleteAllCopies: false,
			includesProtectedOrigin: false,
			canProceedSafely: true,
			targetPaths: [
				'/alice/files/dup1/video.mp4',
				'/alice/files/dup2/video.mp4',
			],
		})

		// Supports null file IDs by falling back to file.path
		const noIdFiles = [
			{ id: null, path: '/alice/files/a/doc.pdf', size: 1024, isInOriginFolder: false },
			{ id: null, path: '/alice/files/b/doc.pdf', size: 1024, isInOriginFolder: false },
		]
		const noIdPlan = evaluateDeletionPlan(noIdFiles, ['/alice/files/b/doc.pdf'])
		assert.equal(noIdPlan.selectedCount, 1)
		assert.equal(noIdPlan.survivingCount, 1)
		assert.equal(noIdPlan.reclaimableBytes, 1024)
		assert.equal(noIdPlan.reclaimableFormatted, '1 KB')
		assert.equal(noIdPlan.canProceedSafely, true)
		assert.deepEqual(noIdPlan.targetPaths, ['/alice/files/b/doc.pdf'])
	})

	test('evaluateDeletionPlan blocks 100% copy deletion and protected origin files', () => {
		const { evaluateDeletionPlan } = loadModule('src/tools/deleteSafetyGuard.js')

		const allDeletable = [
			{ id: 1, path: '/alice/files/a/song.mp3', size: 512000, isInOriginFolder: false },
			{ id: 2, path: '/alice/files/b/song.mp3', size: 512000, isInOriginFolder: false },
		]
		const deleteAllPlan = evaluateDeletionPlan(allDeletable, [1, 2])
		assert.equal(deleteAllPlan.selectedCount, 2)
		assert.equal(deleteAllPlan.survivingCount, 0)
		assert.equal(deleteAllPlan.wouldDeleteAllCopies, true)
		assert.equal(deleteAllPlan.includesProtectedOrigin, false)
		assert.equal(deleteAllPlan.canProceedSafely, false)
		assert.equal(deleteAllPlan.reclaimableBytes, 1024000)
		assert.equal(deleteAllPlan.reclaimableFormatted, '1000 KB')

		const withProtected = [
			{ id: 1, path: '/alice/files/Origin/song.mp3', size: 512000, isInOriginFolder: true },
			{ id: 2, path: '/alice/files/Dup/song.mp3', size: 512000, isInOriginFolder: false },
		]
		const protectedPlan = evaluateDeletionPlan(withProtected, [1])
		assert.equal(protectedPlan.selectedCount, 1)
		assert.equal(protectedPlan.survivingCount, 1)
		assert.equal(protectedPlan.wouldDeleteAllCopies, false)
		assert.equal(protectedPlan.includesProtectedOrigin, true)
		assert.equal(protectedPlan.canProceedSafely, false)
	})

	test('DuplicateDetails renders live polite safety summary, warns on 100% selection, and opens native <dialog> supporting Escape, Cancel, and Confirm', async () => {
		const deleteCalls = []
		const shownErrors = []
		const Details = createDetailsComponent({
			deleteFiles: async (files, options) => {
				deleteCalls.push({ paths: files.map(f => f.path), options })
				return { success: [...files], errors: [] }
			},
		})

		const duplicate = {
			id: 77,
			hash: 'hash-safety-77',
			acknowledged: false,
			files: [
				{ id: 1, nodeId: 11, path: '/alice/files/a/archive.zip', size: 2048, mimetype: 'application/zip', isInOriginFolder: false },
				{ id: 2, nodeId: 12, path: '/alice/files/b/archive.zip', size: 2048, mimetype: 'application/zip', isInOriginFolder: false },
				{ id: 3, nodeId: 13, path: '/alice/files/c/archive.zip', size: 2048, mimetype: 'application/zip', isInOriginFolder: false },
			],
		}

		const wrapper = new Vue({
			data() {
				return { duplicate }
			},
			render(h) {
				return h(Details, {
					props: { duplicate: this.duplicate },
					on: {
						showError: msg => shownErrors.push(msg),
					},
				})
			},
		}).$mount()
		document.body.appendChild(wrapper.$el)
		await settle()

		const detailsVm = wrapper.$children[0]
		assert.equal(detailsVm.$el.querySelector('.deletion-safety-summary'), null, 'safety summary hidden when 0 files selected')

		const checkboxes = Array.from(detailsVm.$el.querySelectorAll('input.file-row-checkbox:not(.file-header-checkbox)'))
		assert.equal(checkboxes.length, 3)

		// Select 2 of 3 copies -> polite live summary reflects 2 selected, 1 kept, 4 KB freed
		checkboxes[1].click()
		checkboxes[2].click()
		await settle()

		const summary = detailsVm.$el.querySelector('.deletion-safety-summary[aria-live="polite"]')
		assert.ok(summary, 'renders aria-live="polite" safety summary when >= 1 file selected')
		assert.ok(summary.classList.contains('is-safe'))
		assert.ok(summary.textContent.includes('2'))
		assert.ok(summary.textContent.includes('1'))
		assert.ok(summary.textContent.includes('4 KB'))
		assert.equal(summary.querySelector('.deletion-safety-summary__warning'), null)

		// Select the last remaining copy -> explicit all-copies warning appears live
		checkboxes[0].click()
		await settle()
		assert.ok(summary.classList.contains('is-danger'))
		const warning = summary.querySelector('.deletion-safety-summary__warning')
		assert.ok(warning, 'warns explicitly when user attempts to select all copies')
		assert.match(warning.textContent, /all copies/i)

		// Uncheck first copy -> safe partial selection again
		checkboxes[0].click()
		await settle()
		assert.ok(summary.classList.contains('is-safe'))
		assert.equal(summary.querySelector('.deletion-safety-summary__warning'), null)

		// Click Delete Selected -> opens native <dialog> showing exact deleted, kept, and freed metrics
		const deleteSelectedBtn = detailsVm.$el.querySelector('button.delete-selected-button')
		deleteSelectedBtn.click()
		await settle()

		let dialog = detailsVm.$el.querySelector('dialog.nc-confirm-dialog[role="alertdialog"]')
		assert.ok(dialog, 'renders native <dialog> confirmation element')
		assert.equal(dialog.tagName, 'DIALOG')
		assert.ok(dialog.hasAttribute('open'))
		assert.ok(dialog.textContent.includes('2'))
		assert.ok(dialog.textContent.includes('1'))
		assert.ok(dialog.textContent.includes('4 KB'))
		assert.equal(deleteCalls.length, 0, 'does not delete before confirmation')

		// Pressing Escape closes dialog and cancels deletion
		dialog.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
		await settle()
		assert.equal(detailsVm.$el.querySelector('dialog.nc-confirm-dialog'), null)
		assert.equal(deleteCalls.length, 0)

		// Re-open and click Cancel -> deletes nothing
		deleteSelectedBtn.click()
		await settle()
		dialog = detailsVm.$el.querySelector('dialog.nc-confirm-dialog')
		assert.ok(dialog)
		dialog.querySelector('.nc-confirm-dialog__button--cancel').click()
		await settle()
		assert.equal(detailsVm.$el.querySelector('dialog.nc-confirm-dialog'), null)
		assert.equal(deleteCalls.length, 0)

		// Re-open and click Confirm -> executes deletion with allowLastCopy: false
		deleteSelectedBtn.click()
		await settle()
		dialog = detailsVm.$el.querySelector('dialog.nc-confirm-dialog')
		dialog.querySelector('.nc-confirm-dialog__button--danger').click()
		await settle()
		assert.equal(detailsVm.$el.querySelector('dialog.nc-confirm-dialog'), null)
		assert.equal(deleteCalls.length, 1)
		assert.deepEqual(deleteCalls[0], {
			paths: ['/alice/files/b/archive.zip', '/alice/files/c/archive.zip'],
			options: { allowLastCopy: false },
		})

		// Protected origin guard: with an unresolved group containing a protected origin file,
		// forcing it into selectedFiles shows the protected warning and blocks dialog & deleteFiles
		wrapper.duplicate = {
			id: 78,
			hash: 'hash-safety-protected',
			acknowledged: false,
			files: [
				{ id: 99, nodeId: 199, path: '/alice/files/Origin/protected.zip', size: 2048, mimetype: 'application/zip', isInOriginFolder: true },
				{ id: 100, nodeId: 200, path: '/alice/files/Dup/protected.zip', size: 2048, mimetype: 'application/zip', isInOriginFolder: false },
			],
		}
		await settle()
		detailsVm.selectedFiles = [detailsVm.duplicate.files[0]]
		await settle()
		const protectedWarning = detailsVm.$el.querySelector('.deletion-safety-summary__warning')
		assert.ok(protectedWarning)
		assert.match(protectedWarning.textContent, /Protected/i)
		await detailsVm.deleteSelectedDuplicates()
		await settle()
		assert.equal(detailsVm.$el.querySelector('dialog.nc-confirm-dialog'), null)
		assert.equal(deleteCalls.length, 1)
		assert.equal(shownErrors.length, 1)
		assert.equal(shownErrors[0], 'Cannot delete protected files')

		wrapper.$destroy()
	})

	test('deleteSafetyGuard and DuplicateDetails adhere to logical CSS, 44px targets, focus-visible, zero XSS, and zero dashes', () => {
		const guardSource = readFileSync(resolve(root, 'src/tools/deleteSafetyGuard.js'), 'utf8')
		const detailsSource = readFileSync(resolve(root, 'src/components/DuplicateDetails.vue'), 'utf8')

		assert.ok(!/[\u2013\u2014]/.test(guardSource), 'deleteSafetyGuard.js has zero U+2013/U+2014 dashes')
		assert.ok(!/[\u2013\u2014]/.test(detailsSource), 'DuplicateDetails.vue has zero U+2013/U+2014 dashes')
		assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(detailsSource), 'DuplicateDetails.vue has zero XSS sinks')

		const summaryCssStart = detailsSource.indexOf('.deletion-safety-summary {')
		const summaryCssEnd = detailsSource.indexOf('.toolbar-button {')
		const summaryCss = detailsSource.slice(summaryCssStart, summaryCssEnd)
		assert.ok(!/(?:margin|padding|border)-(?:left|right|top|bottom)/.test(summaryCss), 'safety summary CSS uses logical properties only')

		const dialogCssStart = detailsSource.indexOf('dialog.nc-confirm-dialog {')
		const dialogCss = detailsSource.slice(dialogCssStart)
		assert.ok(!/(?:margin|padding|border)-(?:left|right|top|bottom)/.test(dialogCss), 'dialog CSS uses logical properties only')
		assert.ok(dialogCss.includes('min-block-size: 44px'), 'dialog buttons enforce >= 44px height')
		assert.ok(dialogCss.includes('min-inline-size: 44px'), 'dialog buttons enforce >= 44px width')
		assert.ok(dialogCss.includes('.nc-confirm-dialog__button:focus-visible'), 'dialog buttons style :focus-visible')
	})
})
