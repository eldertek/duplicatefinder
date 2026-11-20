const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { loadModule } = require('./helpers.cjs')

describe('Issue 240: Live Photo video deletion blocked by Nextcloud core', () => {
	test('deleteFile surfaces a clear Live Photo explanation on 409 LIVE_PHOTO_VIDEO_PROTECTED and rethrows so the file stays in list', async () => {
		const errorMessages = []
		const successMessages = []
		const api = loadModule('src/tools/api.js', {
			axios: {
				defaults: { headers: { common: {} } },
				post: async () => {
					const err = new Error('Request failed with status code 409')
					err.response = {
						status: 409,
						data: {
							error: 'LIVE_PHOTO_VIDEO_PROTECTED',
							message: 'Cannot delete "/Photos/IMG_0042.mov" directly because Nextcloud protects the video part of a Live Photo. Delete the paired photo instead only if both files are redundant.',
						},
					}
					throw err
				},
			},
			'@nextcloud/router': { generateUrl: p => p },
			'@/tools/notifications': {
				showSuccessNotification: msg => successMessages.push(msg),
				showErrorNotification: msg => errorMessages.push(msg),
			},
			'@/tools/utils': { normalizeItemPath: p => p },
		})

		await assert.rejects(
			() => api.deleteFile({ path: '/Photos/IMG_0042.mov', nodeId: 42, fileHash: 'hash42' }),
			/status code 409/
		)

		assert.deepEqual(successMessages, [])
		assert.deepEqual(errorMessages, [
			'Cannot delete the video part of a Live Photo directly. Delete the paired photo instead only if both files are redundant.',
		])
	})

	test('deleteFile surfaces a clear message on 409 DELETE_ABORTED instead of generic Error deleting file', async () => {
		const errorMessages = []
		const api = loadModule('src/tools/api.js', {
			axios: {
				defaults: { headers: { common: {} } },
				post: async () => {
					const err = new Error('Request failed with status code 409')
					err.response = {
						status: 409,
						data: {
							error: 'DELETE_ABORTED',
							message: 'File deletion was aborted by Nextcloud for "/Docs/report.pdf"',
						},
					}
					throw err
				},
			},
			'@nextcloud/router': { generateUrl: p => p },
			'@/tools/notifications': {
				showSuccessNotification: () => {},
				showErrorNotification: msg => errorMessages.push(msg),
			},
			'@/tools/utils': { normalizeItemPath: p => p },
		})

		await assert.rejects(
			() => api.deleteFile({ path: '/Docs/report.pdf', nodeId: 88 }),
			/status code 409/
		)

		assert.deepEqual(errorMessages, [
			'File deletion was aborted by Nextcloud.',
		])
	})

	test('deleteFiles records blocked Live Photo video in errors without touching non-selected paired photo', async () => {
		const requestedBodies = []
		const errorMessages = []
		const api = loadModule('src/tools/api.js', {
			axios: {
				defaults: { headers: { common: {} } },
				post: async (_url, body) => {
					requestedBodies.push(body)
					if (body.path.endsWith('.mov')) {
						const err = new Error('Conflict')
						err.response = {
							status: 409,
							data: { error: 'LIVE_PHOTO_VIDEO_PROTECTED' },
						}
						throw err
					}
					return { data: { status: 'success' } }
				},
			},
			'@nextcloud/router': { generateUrl: p => p },
			'@/tools/notifications': {
				showSuccessNotification: () => {},
				showErrorNotification: msg => errorMessages.push(msg),
			},
			'@/tools/utils': { normalizeItemPath: p => p },
		})

		const movCopy = { path: '/Photos/IMG_0042.mov', nodeId: 42, fileHash: 'movhash' }
		const regularDup = { path: '/Photos/other-copy.png', nodeId: 99, fileHash: 'pnghash' }

		const res = await api.deleteFiles([movCopy, regularDup])
		assert.deepEqual(res.success, [regularDup])
		assert.deepEqual(res.errors, [movCopy])
		assert.equal(requestedBodies.length, 2)
		assert.ok(errorMessages.includes('Cannot delete the video part of a Live Photo directly. Delete the paired photo instead only if both files are redundant.'))
	})
})
