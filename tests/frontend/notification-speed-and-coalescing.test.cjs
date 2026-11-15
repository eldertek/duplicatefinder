const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { loadModule, document } = require('./helpers.cjs')

function createToastRecorder() {
	const shown = []
	const makeToastFn = kind => (message, options = {}) => {
		const el = document.createElement('div')
		el.className = `toastify ${kind}`
		el.textContent = message
		document.body.appendChild(el)
		const record = {
			kind,
			message,
			options,
			hiddenCount: 0,
			toastElement: el,
			hideToast() {
				record.hiddenCount++
			},
			triggerRemoveCallback() {
				if (el.parentNode) {
					el.parentNode.removeChild(el)
				}
				if (typeof options.onRemove === 'function') {
					options.onRemove()
				}
			},
		}
		shown.push(record)
		return record
	}
	return {
		shown,
		dialogsStub: {
			showSuccess: makeToastFn('success'),
			showError: makeToastFn('error'),
		},
	}
}

describe('Issue 230: fast, non-accumulating toast notifications during bulk duplicate triage', () => {
	test('coalesces 2,000 rapid identical success notifications in place with a short timeout and zero lingering backlog', () => {
		const { shown, dialogsStub } = createToastRecorder()
		const notifications = loadModule('src/tools/notifications.js', {
			'@nextcloud/dialogs': dialogsStub,
		})

		for (let i = 0; i < 2000; i++) {
			notifications.showSuccessNotification('Duplicate acknowledged successfully')
		}

		assert.equal(shown.length, 2000)
		assert.equal(shown[0].message, 'Duplicate acknowledged successfully')
		assert.equal(shown[0].options.timeout, notifications.SUCCESS_TOAST_TIMEOUT_MS)
		assert.equal(shown[1].message, 'Duplicate acknowledged successfully (×2)')
		assert.equal(shown[1999].message, 'Duplicate acknowledged successfully (×2000)')

		// Every superseded toast was hidden immediately and removed from DOM so only 1 toast is visible
		const visibleSuccessToasts = document.querySelectorAll('.toastify.success')
		assert.equal(visibleSuccessToasts.length, 1)
		assert.equal(visibleSuccessToasts[0].textContent, 'Duplicate acknowledged successfully (×2000)')
		assert.equal(shown[0].hiddenCount, 1)
		assert.equal(shown[1998].hiddenCount, 1)
		assert.equal(shown[1999].hiddenCount, 0)

		// Delayed Toastify 400ms callbacks from superseded toasts do NOT clear the active toast or trigger new queued toasts
		shown[0].triggerRemoveCallback()
		shown[1998].triggerRemoveCallback()
		assert.equal(shown.length, 2000)

		// Once the final active toast expires, the next action starts cleanly back at count 1
		shown[1999].triggerRemoveCallback()
		notifications.showSuccessNotification('Duplicate acknowledged successfully')
		assert.equal(shown[2000].message, 'Duplicate acknowledged successfully')

		notifications.resetNotificationsForTests()
	})

	test('switching success action types replaces the active success toast immediately with counter reset', () => {
		const { shown, dialogsStub } = createToastRecorder()
		const notifications = loadModule('src/tools/notifications.js', {
			'@nextcloud/dialogs': dialogsStub,
		})

		notifications.showSuccessNotification('Duplicate acknowledged successfully')
		notifications.showSuccessNotification('Duplicate acknowledged successfully')
		notifications.showSuccessNotification('File deleted successfully.')

		assert.equal(shown.length, 3)
		assert.equal(shown[1].message, 'Duplicate acknowledged successfully (×2)')
		assert.equal(shown[2].message, 'File deleted successfully.')
		assert.equal(document.querySelectorAll('.toastify.success').length, 1)
		assert.equal(document.querySelector('.toastify.success').textContent, 'File deleted successfully.')

		notifications.resetNotificationsForTests()
	})

	test('keeps error notifications queued with readable timeout and deduplicates identical queued bursts', () => {
		const { shown, dialogsStub } = createToastRecorder()
		const notifications = loadModule('src/tools/notifications.js', {
			'@nextcloud/dialogs': dialogsStub,
		})

		notifications.showErrorNotification('Permission denied to delete file')
		notifications.showErrorNotification('File not found')
		notifications.showErrorNotification('File is currently locked. Please try again later.')
		notifications.showErrorNotification('File is currently locked. Please try again later.')

		// 2 active error toasts shown immediately, 3rd+4th coalesced in queue
		assert.equal(shown.length, 2)
		assert.equal(shown[0].options.timeout, notifications.ERROR_TOAST_TIMEOUT_MS)

		shown[0].triggerRemoveCallback()
		assert.equal(shown.length, 3)
		assert.equal(shown[2].message, 'File is currently locked. Please try again later. (×2)')

		notifications.resetNotificationsForTests()
	})

	test('deleteFiles emits a single batch summary toast instead of N per-file toasts plus a summary toast', async () => {
		const successMessages = []
		const errorMessages = []
		const api = loadModule('src/tools/api.js', {
			axios: {
				defaults: { headers: { common: {} } },
				post: async () => ({ data: { ok: true } }),
			},
			'@nextcloud/router': { generateUrl: p => p },
			'@/tools/notifications': {
				showSuccessNotification: msg => successMessages.push(msg),
				showErrorNotification: msg => errorMessages.push(msg),
			},
			'@/tools/utils': { normalizeItemPath: p => p },
		})

		const files = [1, 2, 3, 4, 5].map(i => ({
			path: `/alice/files/dup-${i}.jpg`,
			nodeId: 100 + i,
			fileHash: 'abc123',
		}))

		const result = await api.deleteFiles(files)
		assert.equal(result.success.length, 5)
		assert.equal(result.errors.length, 0)
		assert.deepEqual(successMessages, ['5 files deleted successfully.'])
		assert.deepEqual(errorMessages, [])
	})
})
