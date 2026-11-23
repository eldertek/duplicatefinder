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

function createBulkComponent({ entities, deleteCalls }) {
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})
	const slotBox = tag => ({
		render(h) {
			return h(tag, { on: this.$listeners }, this.$slots.default)
		},
	})

	return loadComponent('src/components/BulkDeletionSettings.vue', {
		'@nextcloud/vue': {
			NcButton: {
				props: ['type', 'disabled'],
				render(h) {
					return h(
						'button',
						{
							attrs: { type: 'button', disabled: Boolean(this.disabled) },
							on: this.$listeners,
						},
						this.$slots.default,
					)
				},
			},
			NcCheckboxRadioSwitch: {
				props: ['checked'],
				render(h) {
					return h(
						'label',
						{
							on: {
								click: () => this.$emit('update:checked', !this.checked),
							},
						},
						this.$slots.default,
					)
				},
			},
			NcEmptyContent: {
				render(h) {
					return h('div', [
						this.$slots.default,
						this.$scopedSlots.action ? this.$scopedSlots.action() : null,
					])
				},
			},
			NcLoadingIcon: slotBox('span'),
			NcActions: slotBox('div'),
			NcActionButton: slotBox('button'),
		},
		'@/tools/api': {
			fetchDuplicatesForBulk: async () => ({
				entities,
				pagination: { currentPage: 1, totalPages: 1, totalItems: entities.length, limit: 100 },
			}),
			deleteFiles: async files => {
				deleteCalls.push(files)
				return { success: files, errors: [] }
			},
		},
		'@/tools/utils': utils,
		'vue-material-design-icons/ChevronDown.vue': slotBox('span'),
		'@nextcloud/l10n': { translate: global.t },
	})
}

describe('Cycle 117: Dry-run deletion audit, surviving-copy verification, and deletion plan export', () => {
	test('buildDeletionAuditPlan and buildDeletionPlanJson compute accurate target/surviving entries and manifest JSON', () => {
		const {
			DELETION_PLAN_SCHEMA,
			buildDeletionAuditPlan,
			buildDeletionPlanJson,
			downloadDeletionPlanJson,
		} = loadModule('src/tools/deleteSafetyGuard.js')

		const emptyPlan = buildDeletionAuditPlan([], [])
		assert.equal(emptyPlan.selectedCount, 0)
		assert.equal(emptyPlan.survivingCount, 0)
		assert.equal(emptyPlan.targetEntries.length, 0)
		assert.equal(emptyPlan.survivingEntries.length, 0)
		assert.equal(downloadDeletionPlanJson({ id: 1 }, emptyPlan), false)

		const files = [
			{ id: 1, path: '/alice/files/Origin/2024/photo.jpg', size: 3072, isInOriginFolder: true },
			{ id: 2, path: '/alice/files/Backups/photo.jpg', size: 3072, isInOriginFolder: false },
			{ id: 3, path: '/alice/files/Downloads/photo-copy.jpg', size: 3072, isInOriginFolder: false },
		]

		const auditPlan = buildDeletionAuditPlan(files, [2, 3])
		assert.equal(auditPlan.selectedCount, 2)
		assert.equal(auditPlan.survivingCount, 1)
		assert.equal(auditPlan.protectedSurvivingCount, 1)
		assert.equal(auditPlan.reclaimableBytes, 6144)
		assert.equal(auditPlan.reclaimableFormatted, '6 KB')
		assert.equal(auditPlan.survivingBytes, 3072)
		assert.equal(auditPlan.survivingFormatted, '3 KB')
		assert.equal(auditPlan.wouldDeleteAllCopies, false)
		assert.equal(auditPlan.includesProtectedOrigin, false)
		assert.equal(auditPlan.canProceedSafely, true)

		assert.deepEqual(
			auditPlan.targetEntries.map(e => ({ path: e.normalizedPath, folder: e.folder, fileName: e.fileName, size: e.formattedSize })),
			[
				{ path: '/Backups/photo.jpg', folder: '/Backups', fileName: 'photo.jpg', size: '3 KB' },
				{ path: '/Downloads/photo-copy.jpg', folder: '/Downloads', fileName: 'photo-copy.jpg', size: '3 KB' },
			],
		)
		assert.deepEqual(
			auditPlan.survivingEntries.map(e => ({ path: e.normalizedPath, isProtected: e.isProtected })),
			[{ path: '/Origin/2024/photo.jpg', isProtected: true }],
		)

		const jsonStr = buildDeletionPlanJson(
			{ id: 42, hash: 'deadbeef12345678', acknowledged: false },
			auditPlan,
			'2026-11-23T12:00:00.000Z',
		)
		const parsed = JSON.parse(jsonStr)
		assert.equal(parsed.schema, DELETION_PLAN_SCHEMA)
		assert.equal(parsed.exportedAt, '2026-11-23T12:00:00.000Z')
		assert.deepEqual(parsed.group, { id: 42, hash: 'deadbeef12345678', acknowledged: false })
		assert.deepEqual(parsed.summary, {
			deleteCount: 2,
			keepCount: 1,
			protectedKeepCount: 1,
			reclaimableBytes: 6144,
			survivingBytes: 3072,
			wouldDeleteAllCopies: false,
			includesProtectedOrigin: false,
			canProceedSafely: true,
		})
		assert.deepEqual(parsed.actions, [
			{ action: 'delete', path: '/Backups/photo.jpg', sizeBytes: 3072, protected: false },
			{ action: 'delete', path: '/Downloads/photo-copy.jpg', sizeBytes: 3072, protected: false },
			{ action: 'keep', path: '/Origin/2024/photo.jpg', sizeBytes: 3072, protected: true },
		])
	})

	test('DuplicateDetails opens Dry-Run Audit dialog, shows exact delete/keep paths, exports JSON plan, and executes only on confirm', async () => {
		const deleteCalls = []
		const Details = createDetailsComponent({
			deleteFiles: async (files, options) => {
				deleteCalls.push({ paths: files.map(f => f.path), options })
				return { success: [...files], errors: [] }
			},
		})

		const duplicate = {
			id: 901,
			hash: 'abcdef1234567890',
			acknowledged: false,
			files: [
				{ id: 1, nodeId: 101, path: '/alice/files/Origin/master.png', size: 4096, mimetype: 'image/png', isInOriginFolder: true },
				{ id: 2, nodeId: 102, path: '/alice/files/Temp/copy1.png', size: 4096, mimetype: 'image/png', isInOriginFolder: false },
				{ id: 3, nodeId: 103, path: '/alice/files/<img src=x onerror=alert(1)>/copy2.png', size: 4096, mimetype: 'image/png', isInOriginFolder: false },
			],
		}

		const wrapper = new Vue({
			data: { duplicate },
			render(h) {
				return h(Details, { props: { duplicate: this.duplicate } })
			},
		}).$mount()
		document.body.appendChild(wrapper.$el)

		const origCreateObjectURL = global.URL.createObjectURL
		const origRevokeObjectURL = global.URL.revokeObjectURL
		const origAnchorClick = global.window.HTMLAnchorElement.prototype.click
		const capturedBlobs = []
		const clickedDownloads = []

		global.URL.createObjectURL = blob => {
			capturedBlobs.push(blob)
			return 'blob:mock-deletion-plan'
		}
		global.URL.revokeObjectURL = () => {}
		global.window.HTMLAnchorElement.prototype.click = function () {
			clickedDownloads.push({
				href: this.href,
				download: this.getAttribute('download'),
			})
		}

		try {
			await settle()
			const vm = wrapper.$children[0]

			// Review plan button hidden until at least 1 file is selected
			assert.equal(vm.$el.querySelector('button.review-deletion-plan-button'), null)

			const checkboxes = Array.from(vm.$el.querySelectorAll('input.file-row-checkbox:not(.file-header-checkbox)'))
			checkboxes[1].click()
			checkboxes[2].click()
			await settle()

			const reviewBtn = vm.$el.querySelector('button.review-deletion-plan-button')
			assert.ok(reviewBtn, 'Review plan button renders when files are selected')

			// Open Dry-run audit dialog
			reviewBtn.click()
			await settle()

			const dialog = vm.$el.querySelector('dialog.nc-confirm-dialog[open]')
			assert.ok(dialog, 'opens native <dialog> in dry-run mode')
			assert.match(dialog.querySelector('#nc-confirm-delete-title').textContent, /Dry-run deletion plan/i)
			assert.equal(deleteCalls.length, 0, 'opening dry-run plan does not delete anything')

			// Verify exact target delete list & XSS-safe rendering
			const deleteItems = Array.from(dialog.querySelectorAll('.nc-confirm-dialog__path-list--delete .nc-confirm-dialog__path-item'))
			assert.equal(deleteItems.length, 2)
			assert.ok(deleteItems[0].textContent.includes('/Temp/copy1.png'))
			assert.ok(deleteItems[1].textContent.includes('/<img src=x onerror=alert(1)>/copy2.png'))
			assert.equal(dialog.querySelectorAll('img, script').length, 0, 'no HTML injection inside dialog paths')

			// Verify surviving kept copies list with Protected origin badge
			const keepItems = Array.from(dialog.querySelectorAll('.nc-confirm-dialog__path-list--keep .nc-confirm-dialog__path-item'))
			assert.equal(keepItems.length, 1)
			assert.ok(keepItems[0].textContent.includes('/Origin/master.png'))
			assert.ok(keepItems[0].textContent.includes('Protected origin'))

			// Export JSON plan right from the dialog
			const exportBtn = dialog.querySelector('.nc-confirm-dialog__button--export')
			assert.ok(exportBtn)
			exportBtn.click()
			await settle()

			assert.equal(clickedDownloads.length, 1)
			assert.equal(clickedDownloads[0].download, 'deletion-plan-abcdef123456.json')
			assert.equal(capturedBlobs.length, 1)
			const exportedText = await capturedBlobs[0].text()
			const exportedJson = JSON.parse(exportedText)
			assert.equal(exportedJson.schema, 'duplicatefinder.deletion-plan.v1')
			assert.equal(exportedJson.summary.deleteCount, 2)
			assert.equal(exportedJson.summary.keepCount, 1)
			assert.equal(deleteCalls.length, 0, 'exporting plan does not execute deletion')

			// Close without executing
			dialog.querySelector('.nc-confirm-dialog__button--cancel').click()
			await settle()
			assert.equal(vm.$el.querySelector('dialog.nc-confirm-dialog'), null)
			assert.equal(deleteCalls.length, 0)

			// Re-open dry-run audit and click Execute deletion -> executes deletion
			reviewBtn.click()
			await settle()
			const reopenedDialog = vm.$el.querySelector('dialog.nc-confirm-dialog[open]')
			assert.ok(reopenedDialog)
			reopenedDialog.querySelector('.nc-confirm-dialog__button--danger').click()
			await settle()

			assert.equal(deleteCalls.length, 1)
			assert.deepEqual(deleteCalls[0], {
				paths: ['/alice/files/Temp/copy1.png', '/alice/files/<img src=x onerror=alert(1)>/copy2.png'],
				options: { allowLastCopy: false },
			})
		} finally {
			global.URL.createObjectURL = origCreateObjectURL
			global.URL.revokeObjectURL = origRevokeObjectURL
			global.window.HTMLAnchorElement.prototype.click = origAnchorClick
			wrapper.$destroy()
		}
	})

	test('DuplicateDetails dialog warns explicitly when 0 copies would survive', async () => {
		const Details = createDetailsComponent()
		const duplicate = {
			id: 902,
			hash: 'warn00001111',
			acknowledged: false,
			files: [
				{ id: 10, nodeId: 110, path: '/alice/files/A/doc.pdf', size: 2048, mimetype: 'application/pdf', isInOriginFolder: false },
				{ id: 11, nodeId: 111, path: '/alice/files/B/doc.pdf', size: 2048, mimetype: 'application/pdf', isInOriginFolder: false },
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
			const vm = wrapper.$children[0]
			const checkboxes = Array.from(vm.$el.querySelectorAll('input.file-row-checkbox:not(.file-header-checkbox)'))
			checkboxes[0].click()
			checkboxes[1].click()
			await settle()

			vm.$el.querySelector('button.review-deletion-plan-button').click()
			await settle()

			const dialog = vm.$el.querySelector('dialog.nc-confirm-dialog[open]')
			assert.ok(dialog)
			assert.equal(dialog.querySelector('.nc-confirm-dialog__path-list--keep'), null)
			const emptyKeepWarning = dialog.querySelector('.nc-confirm-dialog__empty-keep-warning')
			assert.ok(emptyKeepWarning)
			assert.match(emptyKeepWarning.textContent, /No copies will remain/i)

			dialog.querySelector('.nc-confirm-dialog__button--cancel').click()
			await settle()
		} finally {
			wrapper.$destroy()
		}
	})

	test('BulkDeletionSettings confirm dialog shows exact dry-run stats and auto-preservation notice without mutating on cancel', async () => {
		const deleteCalls = []
		const BulkDeletionSettings = createBulkComponent({
			deleteCalls,
			entities: [
				{
					hash: 'bulk-g1',
					protectedFileCount: 0,
					hasOnlyProtectedFiles: false,
					files: [
						{ path: '/alice/files/A/file.bin', size: 1024, nodeId: 1, mimetype: 'application/octet-stream' },
						{ path: '/alice/files/B/file.bin', size: 1024, nodeId: 2, mimetype: 'application/octet-stream' },
					],
				},
			],
		})

		const vm = new Vue(BulkDeletionSettings).$mount()
		try {
			await vm.performDryRun()
			await settle()

			// User selects both copies in non-protected group
			vm.toggleGroup('bulk-g1')
			await settle()
			assert.deepEqual(Array.from(vm.selectedFiles['bulk-g1']), [0, 1])

			// Open confirmBulkDelete -> stats show safe plan (1 file deleted, 1 group, 1 KB, 1 copy auto-kept)
			const cancelPromise = vm.confirmBulkDelete()
			await settle()

			const stats = vm.$el.querySelector('.nc-confirm-dialog__stats')
			assert.ok(stats, 'bulk confirm dialog renders exact impact stats')
			assert.ok(stats.textContent.includes('1'))
			assert.ok(stats.textContent.includes('1 KB'))

			const note = vm.$el.querySelector('.nc-confirm-dialog__note')
			assert.ok(note, 'shows auto-preservation notice when all non-protected copies were selected')
			assert.match(note.textContent, /1 copy\/copies will be kept automatically/i)

			// Cancel preserves original user selection and executes 0 deletions
			vm.$el.querySelector('.nc-confirm-dialog__button--cancel').click()
			await cancelPromise
			await settle()
			assert.equal(deleteCalls.length, 0)
			assert.deepEqual(Array.from(vm.selectedFiles['bulk-g1']), [0, 1])

			// Confirm actually applies safe plan and deletes only index 0 (keeping index 1)
			const confirmPromise = vm.confirmBulkDelete()
			await settle()
			vm.$el.querySelector('.nc-confirm-dialog__button--danger').click()
			await confirmPromise
			await settle()

			assert.equal(deleteCalls.length, 1)
			assert.equal(deleteCalls[0].length, 1)
			assert.equal(deleteCalls[0][0].path, '/alice/files/A/file.bin')
		} finally {
			vm.$destroy()
		}
	})

	test('Cycle 117 files enforce zero dashes, zero XSS sinks, logical CSS, >= 44px touch targets, and focus-visible', () => {
		const files = [
			'src/tools/deleteSafetyGuard.js',
			'src/components/DuplicateDetails.vue',
			'src/components/BulkDeletionSettings.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(root, relPath), 'utf8')
			assert.ok(!/[\u2013\u2014]/.test(content), `${relPath} must not contain U+2013/U+2014 dashes`)
			assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(content), `${relPath} must not contain XSS sinks`)
		}

		const detailsSource = readFileSync(resolve(root, 'src/components/DuplicateDetails.vue'), 'utf8')
		const dialogCss = detailsSource.slice(detailsSource.indexOf('dialog.nc-confirm-dialog {'))
		assert.ok(!/(?:margin|padding|border)-(?:left|right|top|bottom)/.test(dialogCss), 'DuplicateDetails dialog CSS uses logical properties only')
		assert.ok(dialogCss.includes('.nc-confirm-dialog__audit'), 'styles dry-run path audit section')
		assert.ok(dialogCss.includes('.nc-confirm-dialog__button--export'), 'styles JSON plan export button')
	})
})
