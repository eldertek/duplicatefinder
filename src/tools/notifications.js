import { showError as showErrorToast, showSuccess as showSuccessToast } from '@nextcloud/dialogs'

export const SUCCESS_TOAST_TIMEOUT_MS = 2200
export const ERROR_TOAST_TIMEOUT_MS = 7000
const MAX_ACTIVE_ERROR_NOTIFICATIONS = 2

let activeSuccessEntry = null
const errorNotificationQueue = []
let activeErrorNotifications = 0

/**
 * Dismiss an existing Toastify instance immediately without leaving fading elements stacked.
 *
 * @param {object|null} toast - Toastify instance returned by @nextcloud/dialogs
 */
function dismissToastImmediately(toast) {
	if (!toast) {
		return
	}
	if (typeof toast.hideToast === 'function') {
		toast.hideToast()
	}
	const el = toast.toastElement
	if (el && el.parentNode) {
		el.parentNode.removeChild(el)
	}
}

/**
 * Format a coalesced success message when identical actions happen in rapid succession.
 *
 * @param {string} baseMessage - Base localized notification text
 * @param {number} count - Consecutive count for this active burst
 * @return {string}
 */
function formatCoalescedMessage(baseMessage, count) {
	return count > 1 ? `${baseMessage} (×${count})` : baseMessage
}

/**
 * Display the next queued error notification while respecting concurrency bounds.
 */
function displayNextErrorNotification() {
	while (activeErrorNotifications < MAX_ACTIVE_ERROR_NOTIFICATIONS && errorNotificationQueue.length > 0) {
		const nextError = errorNotificationQueue.shift()
		activeErrorNotifications++
		nextError.show()
	}
}

/**
 * Show notification.
 * Success notifications update immediately in place (coalescing consecutive identical messages
 * with a live counter and a shorter timeout) so rapid bulk actions never build up a stale queue.
 * Error notifications remain queued so failures are never lost.
 *
 * @param {string} type - The type of notification ('success' or 'error')
 * @param {string} message - The message to display in the notification
 * @param {object} [options] - Optional toast overrides (e.g. { timeout })
 */
export function showNotification(type, message, options = {}) {
	if (type === 'success') {
		const previousEntry = activeSuccessEntry
		const count = previousEntry && previousEntry.baseMessage === message
			? previousEntry.count + 1
			: 1
		const entry = {
			baseMessage: message,
			count,
			toast: null,
		}
		activeSuccessEntry = entry

		if (previousEntry && previousEntry.toast) {
			dismissToastImmediately(previousEntry.toast)
		}

		const timeout = Number.isFinite(options.timeout) ? options.timeout : SUCCESS_TOAST_TIMEOUT_MS
		entry.toast = showSuccessToast(formatCoalescedMessage(message, count), {
			timeout,
			onRemove: () => {
				if (activeSuccessEntry === entry) {
					activeSuccessEntry = null
				}
			},
		})
		return
	}

	if (type === 'error') {
		const lastQueued = errorNotificationQueue[errorNotificationQueue.length - 1]
		if (lastQueued && lastQueued.baseMessage === message) {
			lastQueued.count++
			return
		}

		const timeout = Number.isFinite(options.timeout) ? options.timeout : ERROR_TOAST_TIMEOUT_MS
		const entry = {
			baseMessage: message,
			count: 1,
			show: null,
		}
		entry.show = () => showErrorToast(formatCoalescedMessage(entry.baseMessage, entry.count), {
			timeout,
			onRemove: () => {
				activeErrorNotifications = Math.max(0, activeErrorNotifications - 1)
				displayNextErrorNotification()
			},
		})

		errorNotificationQueue.push(entry)
		displayNextErrorNotification()
		return
	}

	console.error('Invalid notification type:', type)
}

/**
 * Show success notification
 *
 * @param {string} message - The message to display in the notification
 * @param {object} [options] - Optional toast overrides
 */
export function showSuccessNotification(message, options = {}) {
	showNotification('success', message, options)
}

/**
 * Show error notification
 *
 * @param {string} message - The message to display in the notification
 * @param {object} [options] - Optional toast overrides
 */
export function showErrorNotification(message, options = {}) {
	showNotification('error', message, options)
}

/**
 * Reset internal state (for unit tests).
 */
export function resetNotificationsForTests() {
	if (activeSuccessEntry && activeSuccessEntry.toast) {
		dismissToastImmediately(activeSuccessEntry.toast)
	}
	activeSuccessEntry = null
	errorNotificationQueue.length = 0
	activeErrorNotifications = 0
}
