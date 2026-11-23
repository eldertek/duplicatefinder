const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { loadModule, loadComponent, window } = require('./helpers.cjs')

function conflict(code) {
	const error = new Error(code)
	error.response = { status: 409, data: { error: code } }
	return error
}

function apiWith(post, notifications = []) {
	return loadModule('src/tools/api.js', {
		axios: { defaults: { headers: { common: {} } }, post },
		'@nextcloud/router': { generateUrl: path => path },
		'@/tools/notifications': {
			showSuccessNotification: message => notifications.push(message),
			showErrorNotification: message => notifications.push(message),
		},
		'@/tools/utils': { normalizeItemPath: path => path },
	})
}

describe('Confirmed deletion of complete duplicate Live Photo pairs', () => {
	test('confirmation retries explicitly and skips the already deleted selected peer', async () => {
		const bodies = []
		window.confirm = () => true
		const api = apiWith(async (_url, body) => {
			bodies.push(body)
			if (!body.allowLivePhotoPair) throw conflict('LIVE_PHOTO_CONFIRMATION_REQUIRED')
			return { data: { status: 'success', deletedNodeIds: [10, 11] } }
		})
		const selected = [{ path: '/copy/a.jpg', nodeId: 10 }, { path: '/copy/a.mov', nodeId: '11' }]
		const deletedNodeIds = new Set()
		const result = await api.deleteFiles(selected, { deletedNodeIds })
		assert.deepEqual(result.success, selected)
		assert.deepEqual(result.errors, [])
		assert.equal(bodies.length, 2)
		assert.equal(bodies[0].allowLivePhotoPair, undefined)
		assert.equal(bodies[1].allowLivePhotoPair, true)
		assert.deepEqual([...deletedNodeIds], [10, 11])
	})

	test('cancelling does not count a deletion or report a failure', async () => {
		const notifications = []
		let requests = 0
		window.confirm = () => false
		const api = apiWith(async () => {
			requests++
			throw conflict('LIVE_PHOTO_CONFIRMATION_REQUIRED')
		}, notifications)
		const result = await api.deleteFiles([{ path: '/copy/a.mov', nodeId: 11 }])
		assert.equal(requests, 1)
		assert.deepEqual(result, { success: [], errors: [] })
		assert.deepEqual(notifications, [])
	})

	test('a pair that becomes protected after confirmation is not retried again', async () => {
		let requests = 0
		window.confirm = () => true
		const api = apiWith(async () => {
			requests++
			throw conflict(requests === 1 ? 'LIVE_PHOTO_CONFIRMATION_REQUIRED' : 'LIVE_PHOTO_PAIR_PROTECTED')
		})
		await assert.rejects(() => api.deleteFile({ path: '/copy/a.jpg', nodeId: 10 }), /LIVE_PHOTO_PAIR_PROTECTED/)
		assert.equal(requests, 2)
	})

	test('ordinary deletions retain the existing response contract', async () => {
		window.confirm = () => assert.fail('Ordinary deletion must not request pair confirmation')
		const api = apiWith(async () => ({ data: { status: 'success' } }))
		assert.equal(await api.deleteFile({ path: '/copy/a.txt', nodeId: 20 }), true)
	})

	test('cancelling a single deletion leaves its file in the displayed list', async () => {
		const component = loadComponent('src/components/DuplicateFileDisplay.vue', {
			'@/tools/api': { deleteFile: async () => false },
			'@/tools/clipboardHelper': { copyTextSafely: async () => false },
			'@/tools/duplicatePathDiff': { formatFileModifiedTime: () => '' },
			'@/tools/utils': { getPreviewImage() {}, normalizeItemPath: path => path, getParentFolderPath() {} },
			'@nextcloud/router': { generateUrl: path => path },
		})
		const events = []
		await component.methods.deleteFile.call({ file: { nodeId: 10 }, $emit: (...event) => events.push(event) })
		assert.deepEqual(events, [])
	})
})
