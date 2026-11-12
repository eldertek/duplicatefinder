// The details view of a duplicate: deleting files must delete, show and keep the files the user chose.
// Issue 180 (data loss): in the details view of a project every file had a null id, the screen removed
// a deleted file by id and so always removed the first row, the copy that should be kept.
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { Vue, loadComponent, loadModule, settle, document } = require('./helpers.cjs')

// DuplicateDetails does not register its spinner itself: Nextcloud provides it
Vue.component('NcLoadingSpinner', { render: h => h('span') })

const utils = loadModule('src/tools/utils.js', { './notifications': { showErrorNotification() {} } })

const path = (folder, name) => `/alice/files/Projects/${folder}/${name}`

function file(folder, name, id, nodeId) {
	return {
		id,
		path: path(folder, name),
		fileHash: 'hash-one',
		nodeId,
		mimetype: 'image/jpeg',
		size: 9000,
		isInOriginFolder: false,
	}
}

/** Three copies of a photo. Project results had no file ids before 1.8.3. */
function group({ withIds }) {
	return {
		id: 7,
		hash: 'hash-one',
		acknowledged: false,
		files: [
			file('a', 'photo-one.jpg', withIds ? 101 : null, 11),
			file('b', 'photo-one-copy.jpg', withIds ? 102 : null, 12),
			file('c', 'photo-one-bis.jpg', withIds ? 103 : null, 13),
		],
	}
}

function mount(duplicate) {
	const calls = { deleteFile: [], deleteFiles: [], resolved: 0 }
	const api = {
		acknowledgeDuplicate: async () => {},
		unacknowledgeDuplicate: async () => {},
		findDuplicates: async () => {},
		deleteFile: async (deleted, options) => {
			calls.deleteFile.push({ path: deleted.path, options })
			return true
		},
		deleteFiles: async (files, options) => {
			calls.deleteFiles.push({ paths: files.map(f => f.path), options })
			return { success: [...files], errors: [] }
		},
	}
	const Display = loadComponent('src/components/DuplicateFileDisplay.vue', {
		'@/tools/api': api,
		'@/tools/utils': utils,
		'@nextcloud/router': { generateUrl: url => url },
	})
	const Details = loadComponent('src/components/DuplicateDetails.vue', {
		'@/tools/api': api,
		'@/tools/utils': utils,
		'@nextcloud/dialogs': { showSuccess() {}, showError() {} },
		'./DuplicateFileDisplay.vue': { __esModule: true, default: Display },
	})
	const wrapper = new Vue({
		data: { duplicate },
		render(h) {
			return h(Details, { props: { duplicate: this.duplicate }, on: { 'duplicate-resolved': () => { calls.resolved++ } } })
		},
	}).$mount()
	document.body.appendChild(wrapper.$el)
	return { wrapper, vm: wrapper.$children[0], calls }
}

const rows = vm => Array.from(vm.$el.querySelectorAll('.file-display'))
const shownPaths = vm => rows(vm).map(row => row.textContent.match(/Path: (\S+)/)[1])
const deleteButtons = vm => rows(vm).map(row => row.querySelector('.delete-button'))
const checkboxes = vm => rows(vm).map(row => row.querySelector('input[type=checkbox]'))
const selectedPaths = vm => vm.selectedFiles.map(f => f.path)
const button = (vm, label) => Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.trim() === label)

for (const withIds of [false, true]) {
	const label = withIds ? 'results with file ids' : 'project results without file ids'

	test(`${label}: deleting the second file removes the second row`, async () => {
		const { vm, calls } = mount(group({ withIds }))

		deleteButtons(vm)[1].click()
		await settle()

		assert.deepEqual(calls.deleteFile.map(c => c.path), [path('b', 'photo-one-copy.jpg')])
		assert.deepEqual(shownPaths(vm), ['/Projects/a/photo-one.jpg', '/Projects/c/photo-one-bis.jpg'])
	})

	test(`${label}: deleting two copies keeps the first one on screen and untouched (issue 180)`, async () => {
		const { vm, calls } = mount(group({ withIds }))

		deleteButtons(vm)[1].click()
		await settle()
		// the row of the third copy is now the second one
		deleteButtons(vm)[1].click()
		await settle()

		assert.deepEqual(calls.deleteFile.map(c => c.path), [
			path('b', 'photo-one-copy.jpg'),
			path('c', 'photo-one-bis.jpg'),
		], 'only the two files the user clicked are deleted')
		// a group of one file has no row left: the parent view moves on to the next duplicate
		assert.deepEqual(vm.duplicate.files.map(f => f.path), [path('a', 'photo-one.jpg')], 'the copy to keep is still in the group')
		assert.equal(calls.resolved, 1, 'a group of one file is resolved')
	})
}

test('a checkbox selects and unselects exactly one file', async () => {
	const { vm } = mount(group({ withIds: false }))

	checkboxes(vm)[1].click()
	await settle()
	assert.deepEqual(selectedPaths(vm), [path('b', 'photo-one-copy.jpg')])

	checkboxes(vm)[1].click()
	await settle()
	assert.deepEqual(selectedPaths(vm), [])
})

test('a file that was unticked after "Select All" is not deleted by "Delete Selected"', async () => {
	const { vm, calls } = mount(group({ withIds: false }))

	button(vm, 'Select All').click()
	await settle()
	assert.deepEqual(selectedPaths(vm), [path('b', 'photo-one-copy.jpg'), path('c', 'photo-one-bis.jpg')])

	// the user keeps the second file after all
	checkboxes(vm)[1].click()
	await settle()
	assert.deepEqual(selectedPaths(vm), [path('c', 'photo-one-bis.jpg')])

	button(vm, 'Delete Selected').click()
	await settle()

	assert.deepEqual(calls.deleteFiles.map(c => c.paths), [[path('c', 'photo-one-bis.jpg')]])
	assert.deepEqual(shownPaths(vm), ['/Projects/a/photo-one.jpg', '/Projects/b/photo-one-copy.jpg'])
})

test('deleting every copy needs the confirmation of the user and is announced to the server', async () => {
	const { vm, calls } = mount(group({ withIds: true }))
	const questions = []
	global.confirm = question => { questions.push(question); return true }
	try {
		checkboxes(vm).forEach(box => box.click())
		await settle()
		assert.equal(vm.selectedFiles.length, 3)

		button(vm, 'Delete Selected').click()
		await settle()

		assert.equal(questions.length, 1)
		assert.deepEqual(calls.deleteFiles.map(c => c.options), [{ allowLastCopy: true }])
	} finally {
		delete global.confirm
	}
})

test('declining the confirmation deletes nothing', async () => {
	const { vm, calls } = mount(group({ withIds: true }))
	global.confirm = () => false
	try {
		checkboxes(vm).forEach(box => box.click())
		await settle()

		button(vm, 'Delete Selected').click()
		await settle()

		assert.deepEqual(calls.deleteFiles, [])
		assert.equal(rows(vm).length, 3)
	} finally {
		delete global.confirm
	}
})

test('deleting some copies never asks to delete the last one', async () => {
	const { vm, calls } = mount(group({ withIds: true }))

	checkboxes(vm)[1].click()
	checkboxes(vm)[2].click()
	await settle()
	button(vm, 'Delete Selected').click()
	await settle()

	assert.deepEqual(calls.deleteFiles.map(c => c.options), [{ allowLastCopy: false }])
})

test('the selection is dropped when another duplicate is opened', async () => {
	const { wrapper, vm } = mount(group({ withIds: true }))

	checkboxes(vm)[1].click()
	await settle()
	assert.equal(vm.selectedFiles.length, 1)

	wrapper.duplicate = { ...group({ withIds: true }), id: 8, hash: 'hash-two' }
	await settle()

	assert.equal(vm.selectedFiles.length, 0)
})

test('a file deleted with its own button leaves the selection', async () => {
	const { vm } = mount(group({ withIds: false }))

	checkboxes(vm)[1].click()
	await settle()
	deleteButtons(vm)[1].click()
	await settle()

	assert.deepEqual(selectedPaths(vm), [])
})

test('files are matched by id, or by path when an id is missing', () => {
	const a = { id: 1, path: '/u/files/a' }
	const b = { id: 2, path: '/u/files/b' }
	assert.equal(utils.isSameFile(a, { id: 1, path: '/moved' }), true)
	assert.equal(utils.isSameFile(a, b), false)
	assert.equal(utils.isSameFile({ id: null, path: '/u/files/a' }, { id: null, path: '/u/files/b' }), false,
		'two missing ids are not the same file')
	assert.equal(utils.isSameFile({ id: null, path: '/u/files/a' }, { id: null, path: '/u/files/a' }), true)
	assert.equal(utils.isSameFile({ path: '/u/files/a' }, { id: 5, path: '/u/files/a' }), true,
		'an entry without id falls back on the path')
	assert.equal(utils.isSameFile(null, a), false)
	assert.equal(utils.fileKey(a), 1)
	assert.equal(utils.fileKey({ id: null, path: '/u/files/c' }), '/u/files/c')

	const list = [{ id: null, path: '/u/files/a' }, { id: null, path: '/u/files/b' }, { id: null, path: '/u/files/c' }]
	utils.removeFileFromList({ id: null, path: '/u/files/b' }, list)
	assert.deepEqual(list.map(f => f.path), ['/u/files/a', '/u/files/c'])
	utils.removeFilesFromList([{ id: null, path: '/u/files/c' }, { id: null, path: '/u/files/a' }], list)
	assert.deepEqual(list, [])
})

test('Keep Folder selects non-protected copies in other folders and preserves all copies in the kept folder (issue 193)', async () => {
	const dup = {
		id: 42,
		hash: 'hash-folder-keep',
		acknowledged: false,
		files: [
			file('a', 'photo-1.jpg', 201, 21),
			file('a', 'photo-1-alt.jpg', 202, 22),
			file('b', 'photo-1.jpg', 203, 23),
			{ ...file('origin', 'photo-1.jpg', 204, 24), isInOriginFolder: true },
		],
	}
	const { vm, calls } = mount(dup)

	const keepButtons = rows(vm).map(row => row.querySelector('.keep-folder-button'))
	assert.ok(keepButtons[0], 'Keep Folder button is rendered when copies exist in other folders')

	// Keep folder /Projects/a: both copies in /Projects/a and the protected copy in /Projects/origin stay unselected,
	// while /Projects/b/photo-1.jpg is selected for deletion
	keepButtons[0].click()
	await settle()

	assert.deepEqual(selectedPaths(vm), [path('b', 'photo-1.jpg')])

	button(vm, 'Delete Selected').click()
	await settle()

	assert.deepEqual(calls.deleteFiles.map(c => c.paths), [[path('b', 'photo-1.jpg')]])
	assert.deepEqual(shownPaths(vm), [
		'/Projects/a/photo-1.jpg',
		'/Projects/a/photo-1-alt.jpg',
		'/Projects/origin/photo-1.jpg',
	])
})

test('Keep Folder button is hidden when all deletable copies share the same folder (issue 193)', async () => {
	const sameFolderGroup = {
		id: 43,
		hash: 'hash-same-folder',
		acknowledged: false,
		files: [
			file('a', 'one.jpg', 301, 31),
			file('a', 'two.jpg', 302, 32),
		],
	}
	const { vm } = mount(sameFolderGroup)
	await settle()

	const keepButtons = vm.$el.querySelectorAll('.keep-folder-button')
	assert.equal(keepButtons.length, 0)
})

test('detail view visual refresh renders table header, per-file size and status badges, and compact icon action buttons (issue 206)', async () => {
	const dup = {
		id: 55,
		hash: 'hash-visual-55',
		acknowledged: false,
		files: [
			file('a', 'frame.png', 401, 41),
			file('b', 'frame.png', 402, 42),
			{ ...file('origin', 'frame.png', 403, 43), isInOriginFolder: true },
		],
	}
	const { vm } = mount(dup)
	await settle()

	const header = vm.$el.querySelector('.files-table-header')
	assert.ok(header, 'files table header bar is rendered')
	assert.ok(header.textContent.includes('Preview'))
	assert.ok(header.textContent.includes('Name & Path'))
	assert.ok(header.textContent.includes('Size'))
	assert.ok(header.textContent.includes('Status'))
	assert.ok(header.textContent.includes('Actions'))

	const groupTitle = vm.$el.querySelector('.details-group-title')
	assert.ok(groupTitle)
	assert.ok(groupTitle.textContent.includes('frame.png'))

	const statusBadges = rows(vm).map(row => row.querySelector('.file-status-badge').textContent.trim())
	assert.deepEqual(statusBadges, ['Original', 'Duplicate', 'Protected'])

	const sizes = rows(vm).map(row => row.querySelector('.file-size-value').textContent.trim())
	assert.deepEqual(sizes, ['9000 B', '9000 B', '9000 B'])

	const firstRow = rows(vm)[0]
	assert.equal(firstRow.querySelector('.open-folder-button').getAttribute('title'), 'Open Folder')
	assert.equal(firstRow.querySelector('.open-file-button').getAttribute('title'), 'Open File')
	assert.equal(firstRow.querySelector('.delete-button').getAttribute('title'), 'Delete')
	assert.equal(rows(vm)[2].querySelector('.protected-button').getAttribute('title'), 'Protected')
})
