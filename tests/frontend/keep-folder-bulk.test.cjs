const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { Vue, loadComponent, loadModule } = require('./helpers.cjs')

const slotBox = tag => ({
	render(h) {
		return h(tag, this.$slots.default)
	},
})

describe('Issue 193: keep folder across multiple duplicate groups in BulkDeletionSettings', () => {
	test('availableKeepFolders ranks multi-folder catalogs and keepFolderAcrossGroups selects only copies in other folders', async () => {
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})

		assert.equal(utils.getParentFolderPath('/alice/files/CatalogA/img1.jpg'), '/CatalogA')
		assert.equal(utils.getParentFolderPath('/alice/files/root.txt'), '/')
		assert.equal(utils.getParentFolderPath('/__groupfolders/2/Shared/doc.pdf'), '/__groupfolders/2/Shared')

		const BulkDeletionSettings = loadComponent('src/components/BulkDeletionSettings.vue', {
			'@nextcloud/vue': {
				NcButton: slotBox('button'),
				NcCheckboxRadioSwitch: slotBox('label'),
				NcEmptyContent: slotBox('div'),
				NcLoadingIcon: slotBox('span'),
				NcActions: slotBox('div'),
				NcActionButton: slotBox('button'),
			},
			'@/tools/api': {
				fetchDuplicatesForBulk: async () => ({
					entities: [
						{
							hash: 'g1',
							files: [
								{ path: '/alice/files/CatalogA/f1.jpg', size: 1000, nodeId: 1 },
								{ path: '/alice/files/CatalogB/f1.jpg', size: 1000, nodeId: 2 },
							],
						},
						{
							hash: 'g2',
							files: [
								{ path: '/alice/files/CatalogA/f2.jpg', size: 2000, nodeId: 3 },
								{ path: '/alice/files/CatalogB/f2.jpg', size: 2000, nodeId: 4 },
								{ path: '/alice/files/CatalogC/f2.jpg', size: 2000, nodeId: 5 },
							],
						},
						{
							hash: 'g3-unrelated',
							files: [
								{ path: '/alice/files/Other1/doc.pdf', size: 500, nodeId: 6 },
								{ path: '/alice/files/Other2/doc.pdf', size: 500, nodeId: 7 },
							],
						},
						{
							hash: 'g4-same-folder',
							files: [
								{ path: '/alice/files/SameDir/a.txt', size: 100, nodeId: 8 },
								{ path: '/alice/files/SameDir/b.txt', size: 100, nodeId: 9 },
							],
						},
					],
					pagination: { currentPage: 1, totalPages: 1, totalItems: 4, limit: 100 },
				}),
				deleteFiles: async () => ({ success: [], errors: [] }),
			},
			'@/tools/utils': utils,
			'vue-material-design-icons/ChevronDown.vue': slotBox('span'),
			'@nextcloud/l10n': { translate: global.t },
		})

		const vm = new Vue(BulkDeletionSettings).$mount()
		await vm.performDryRun()

		assert.deepEqual(vm.availableKeepFolders, [
			{ folder: '/CatalogA', groupCount: 2 },
			{ folder: '/CatalogB', groupCount: 2 },
			{ folder: '/CatalogC', groupCount: 1 },
			{ folder: '/Other1', groupCount: 1 },
			{ folder: '/Other2', groupCount: 1 },
		])

		// Pre-select unrelated group to ensure keepFolderAcrossGroups clears unrelated groups safely
		vm.toggleGroup('g3-unrelated')
		assert.deepEqual(Array.from(vm.selectedFiles['g3-unrelated']), [0, 1])

		vm.keepFolderAcrossGroups('/CatalogA')

		// In g1: index 0 (/CatalogA) preserved, index 1 (/CatalogB) selected
		assert.deepEqual(Array.from(vm.selectedFiles.g1), [1])
		// In g2: index 0 (/CatalogA) preserved, indexes 1 (/CatalogB) and 2 (/CatalogC) selected
		assert.deepEqual(Array.from(vm.selectedFiles.g2), [1, 2])
		// Unrelated groups without a copy in /CatalogA stay unselected
		assert.deepEqual(Array.from(vm.selectedFiles['g3-unrelated']), [])
		assert.deepEqual(Array.from(vm.selectedFiles['g4-same-folder']), [])
		assert.equal(vm.totalFilesToDelete, 3)

		vm.$destroy()
	})
})
