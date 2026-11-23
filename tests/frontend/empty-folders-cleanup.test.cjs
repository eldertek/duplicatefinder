const { describe, test, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

const slotBox = tag => ({
	render(h) {
		return h(tag, { on: this.$listeners }, this.$slots.default)
	},
})

describe('Issue 231: Optional empty folder detection and batch deletion after duplicate cleanup', () => {
	test('api.scanEmptyFolders and api.deleteEmptyFolders call /empty-folders endpoints and emit summary toast', async () => {
		const postCalls = []
		const toasts = []

		const api = loadModule('src/tools/api.js', {
			axios: {
				defaults: { headers: { common: {} } },
				post: async (url, body) => {
					postCalls.push({ url, body })
					if (url.endsWith('/empty-folders/scan')) {
						return {
							data: {
								folders: [{ path: '/Archive/2021', name: '2021', depth: 2, hasEmptySubfolders: false, mtime: 10 }],
								count: 1,
							},
						}
					}
					return {
						data: {
							deleted: ['/Archive/2021'],
							errors: [],
						},
					}
				},
			},
			'@nextcloud/router': { generateUrl: path => path },
			'@/tools/notifications': {
				showSuccessNotification: msg => toasts.push({ type: 'success', msg }),
				showErrorNotification: msg => toasts.push({ type: 'error', msg }),
			},
			'@/tools/utils': { normalizeItemPath: p => p },
		})

		const scanResult = await api.scanEmptyFolders(['/alice/files/Archive/2021/dup.jpg'])
		assert.equal(scanResult.count, 1)
		assert.equal(postCalls[0].url, '/apps/duplicatefinder/api/empty-folders/scan')
		assert.deepEqual(postCalls[0].body, {
			candidatePaths: ['/alice/files/Archive/2021/dup.jpg'],
		})

		const deleteResult = await api.deleteEmptyFolders(['/Archive/2021'])
		assert.deepEqual(deleteResult.deleted, ['/Archive/2021'])
		assert.equal(postCalls[1].url, '/apps/duplicatefinder/api/empty-folders/delete')
		assert.deepEqual(postCalls[1].body, { paths: ['/Archive/2021'] })
		assert.equal(toasts.length, 1)
		assert.equal(toasts[0].msg, '1 empty folder deleted')
	})

	test('BulkDeletionSettings optionally detects empty folders after bulk deletion and deletes selected folders in one go', async () => {
		const scanCalls = []
		const deleteFolderCalls = []

		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})

		const BulkDeletionSettings = loadComponent('src/components/BulkDeletionSettings.vue', {
			'@nextcloud/vue': {
				NcButton: slotBox('button'),
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
					entities: [
						{
							hash: 'h1',
							files: [
								{ path: '/alice/files/Keep/img.jpg', size: 100, nodeId: 1 },
								{ path: '/alice/files/Cleaned/Sub/img.jpg', size: 100, nodeId: 2 },
							],
						},
					],
					pagination: { currentPage: 1, totalPages: 1, totalItems: 1, limit: 100 },
				}),
				deleteFiles: async files => ({ success: files, errors: [] }),
				scanEmptyFolders: async candidatePaths => {
					scanCalls.push(candidatePaths)
					return {
						folders: [
							{ path: '/Cleaned', name: 'Cleaned', depth: 1, hasEmptySubfolders: true, mtime: 1 },
							{ path: '/Cleaned/Sub', name: 'Sub', depth: 2, hasEmptySubfolders: false, mtime: 1 },
						],
						count: 2,
					}
				},
				deleteEmptyFolders: async paths => {
					deleteFolderCalls.push(paths)
					return { deleted: paths, errors: [] }
				},
			},
			'@/tools/utils': utils,
			'vue-material-design-icons/ChevronDown.vue': slotBox('span'),
			'@nextcloud/l10n': { translate: global.t },
		})

		const vm = new Vue(BulkDeletionSettings).$mount()
		await vm.performDryRun()
		await settle()

		// Select second copy (/Cleaned/Sub/img.jpg) and opt in to post-cleanup empty folder detection
		vm.toggleFile('h1', 1)
		vm.detectEmptyFoldersAfterDelete = true
		const bulkDeletePromise = vm.confirmBulkDelete()
		await settle()
		assert.ok(vm.$el.querySelector('.nc-confirm-dialog[role="alertdialog"]'), 'opens Nextcloud confirmation dialog for bulk delete')
		vm.$el.querySelector('.nc-confirm-dialog__button--danger').click()
		await bulkDeletePromise
		await settle()

		assert.equal(scanCalls.length, 1)
		assert.deepEqual(scanCalls[0], ['/alice/files/Cleaned/Sub/img.jpg'])
		assert.equal(vm.emptyFolderScanCompleted, true)
		assert.equal(vm.emptyFolders.length, 2)
		assert.deepEqual(Array.from(vm.selectedEmptyFolders), ['/Cleaned', '/Cleaned/Sub'])

		// Unselect /Cleaned so only /Cleaned/Sub is deleted
		vm.toggleEmptyFolder('/Cleaned')
		assert.deepEqual(Array.from(vm.selectedEmptyFolders), ['/Cleaned/Sub'])

		const emptyDeletePromise = vm.confirmDeleteEmptyFolders()
		await settle()
		assert.ok(vm.$el.querySelector('.nc-confirm-dialog[role="alertdialog"]'), 'opens Nextcloud confirmation dialog for empty folder deletion')
		vm.$el.querySelector('.nc-confirm-dialog__button--danger').click()
		await emptyDeletePromise
		await settle()

		assert.deepEqual(deleteFolderCalls, [['/Cleaned/Sub']])
		assert.equal(vm.emptyFolders.length, 1)
		assert.equal(vm.emptyFolders[0].path, '/Cleaned')

		vm.$destroy()
	})

	test('App topbar Empty Folders button scans recently cleaned locations and deletes selected folders in one go', async () => {
		const scanCalls = []
		const deleteCalls = []
		const icon = slotBox('span')
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'isScanning'],
			render(h) {
				return h('div', { class: `stub-${name}` })
			},
		})
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})

		const App = loadComponent('src/App.vue', {
			'@nextcloud/vue': {
				NcAppContent: slotBox('main'),
				NcContent: slotBox('div'),
				NcLoadingIcon: slotBox('span'),
				NcAppSettingsDialog: slotBox('section'),
				NcAppSettingsSection: slotBox('div'),
				NcButton: slotBox('button'),
				NcModal: slotBox('div'),
			},
			'./components/DuplicateNavigation.vue': { __esModule: true, default: stub('duplicate-nav') },
			'./components/DuplicateDetails.vue': { __esModule: true, default: stub('duplicate-details') },
			'./components/DuplicateTreemap.vue': { __esModule: true, default: stub('duplicate-treemap') },
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('space-reclamation-timeline') },
			'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity-inspector') },
			'./components/OriginFoldersSettings.vue': { __esModule: true, default: stub('origin') },
			'./components/ExcludedFoldersSettings.vue': { __esModule: true, default: stub('excluded') },
			'./components/BulkDeletionSettings.vue': { __esModule: true, default: stub('bulk') },
			'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects') },
			'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('project-dups') },
			'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('guide') },
			'./components/help/UsageExamples.vue': { __esModule: true, default: stub('examples') },
			'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
			'./components/SearchBar.vue': { __esModule: true, default: stub('search') },
			'./components/FilterSettings.vue': { __esModule: true, default: stub('filters') },
			'@/tools/api': {
				fetchDuplicates: async () => ({ entities: [], pagination: { currentPage: 1, totalPages: 1, totalItems: 0 } }),
				fetchProjects: async () => [],
				scanEmptyFolders: async paths => {
					scanCalls.push(paths)
					return {
						folders: [{ path: '/Photos/2023/Duplicates', name: 'Duplicates', depth: 3, hasEmptySubfolders: false, mtime: 1 }],
						count: 1,
					}
				},
				deleteEmptyFolders: async paths => {
					deleteCalls.push(paths)
					return { deleted: paths, errors: [] }
				},
			},
			'@/tools/utils': utils,
			'@/tools/keyboardShortcuts': loadModule('src/tools/keyboardShortcuts.js'),
			'@/tools/reclamationHistory': loadModule('src/tools/reclamationHistory.js', {
				'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
				'./duplicateStats': loadModule('src/tools/duplicateStats.js'),
			}),
			'vue-material-design-icons/Folder': icon,
			'vue-material-design-icons/FolderRemove': icon,
			'vue-material-design-icons/FolderMultiple': icon,
			'vue-material-design-icons/Delete': icon,
			'vue-material-design-icons/FilterOutline': icon,
		})

		const vm = new Vue(App).$mount()
		await settle()

		const topBtn = vm.$el.querySelector('.topbar-empty-folders-button')
		assert.ok(topBtn, 'Empty Folders button stays accessible even when zero duplicates remain')

		vm.recordTouchedFolders(['/alice/files/Photos/2023/Duplicates/dup1.jpg'])
		topBtn.click()
		await settle()

		assert.equal(vm.emptyFoldersModalOpen, true)
		assert.deepEqual(scanCalls, [['/alice/files/Photos/2023/Duplicates/dup1.jpg']])
		assert.deepEqual(Array.from(vm.selectedModalEmptyFolders), ['/Photos/2023/Duplicates'])

		const modalDeletePromise = vm.deleteSelectedModalEmptyFolders()
		await settle()
		assert.ok(vm.$el.querySelector('.empty-folders-modal .nc-confirm-dialog[role="alertdialog"]'), 'renders confirmation dialog inside .empty-folders-modal so NcModal never occludes or traps it')
		vm.$el.querySelector('.empty-folders-modal .nc-confirm-dialog__button--danger').click()
		await modalDeletePromise
		await settle()

		assert.deepEqual(deleteCalls, [['/Photos/2023/Duplicates']])
		assert.equal(vm.modalEmptyFolders.length, 0)
		assert.equal(vm.recentCleanedPaths.length, 0)

		vm.$destroy()
	})

	test('Issue 236: Empty folders support clean checkbox styling, per-folder crossed-out eye ignore/restore, bulk ignore, and persistence across scans', async () => {
		window.localStorage.clear()
		const icon = slotBox('span')
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'isScanning'],
			render(h) {
				return h('div', { class: `stub-${name}` })
			},
		})
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})

		const App = loadComponent('src/App.vue', {
			'@nextcloud/vue': {
				NcAppContent: slotBox('main'),
				NcContent: slotBox('div'),
				NcLoadingIcon: slotBox('span'),
				NcAppSettingsDialog: slotBox('section'),
				NcAppSettingsSection: slotBox('div'),
				NcButton: slotBox('button'),
				NcModal: slotBox('div'),
			},
			'./components/DuplicateNavigation.vue': { __esModule: true, default: stub('duplicate-nav') },
			'./components/DuplicateDetails.vue': { __esModule: true, default: stub('duplicate-details') },
			'./components/DuplicateTreemap.vue': { __esModule: true, default: stub('duplicate-treemap') },
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('space-reclamation-timeline') },
			'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity-inspector') },
			'./components/OriginFoldersSettings.vue': { __esModule: true, default: stub('origin') },
			'./components/ExcludedFoldersSettings.vue': { __esModule: true, default: stub('excluded') },
			'./components/BulkDeletionSettings.vue': { __esModule: true, default: stub('bulk') },
			'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects') },
			'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('project-dups') },
			'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('guide') },
			'./components/help/UsageExamples.vue': { __esModule: true, default: stub('examples') },
			'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
			'./components/SearchBar.vue': { __esModule: true, default: stub('search') },
			'./components/FilterSettings.vue': { __esModule: true, default: stub('filters') },
			'@/tools/api': {
				fetchDuplicates: async () => ({ entities: [], pagination: { currentPage: 1, totalPages: 1, totalItems: 0 } }),
				fetchProjects: async () => [],
				scanEmptyFolders: async () => ({
					folders: [
						{ path: '/PC/.cache/thumbnails', name: 'thumbnails', depth: 3, hasEmptySubfolders: false, mtime: 1 },
						{ path: '/PC/NewEmpty', name: 'NewEmpty', depth: 2, hasEmptySubfolders: false, mtime: 2 },
					],
					count: 2,
				}),
				deleteEmptyFolders: async paths => ({ deleted: paths, errors: [] }),
			},
			'@/tools/utils': utils,
			'@/tools/keyboardShortcuts': loadModule('src/tools/keyboardShortcuts.js'),
			'@/tools/reclamationHistory': loadModule('src/tools/reclamationHistory.js', {
				'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
				'./duplicateStats': loadModule('src/tools/duplicateStats.js'),
			}),
			'vue-material-design-icons/Folder': icon,
			'vue-material-design-icons/FolderRemove': icon,
			'vue-material-design-icons/FolderMultiple': icon,
			'vue-material-design-icons/Delete': icon,
			'vue-material-design-icons/FilterOutline': icon,
		})

		const vm = new Vue(App).$mount()
		await settle()

		vm.$el.querySelector('.topbar-empty-folders-button').click()
		await settle()

		const checkboxes = vm.$el.querySelectorAll('.empty-folder-checkbox')
		assert.equal(checkboxes.length, 2, 'renders clean .empty-folder-checkbox inputs')
		const folderIcons = vm.$el.querySelectorAll('.empty-folder-row-icon')
		assert.equal(folderIcons.length, 2, 'renders folder outline icon next to each checkbox')
		const ignoreBtns = vm.$el.querySelectorAll('.empty-folder-ignore-button')
		assert.equal(ignoreBtns.length, 2, 'renders eye button next to each folder')
		assert.ok(ignoreBtns[0].querySelector('.eye-icon--visible'), 'shows open eye icon without strikethrough before folder is hidden')
		assert.equal(ignoreBtns[0].querySelector('.eye-icon--hidden'), null, 'does not show strikethrough eye icon when folder is visible')
		assert.match(vm.$el.querySelector('.empty-folders-modal__found-count').textContent, /Empty folders found: 2/)
		assert.match(vm.$el.querySelector('.modal-delete-empty-folders-button').textContent, /Permanently delete 2 folders/)

		// Click eye on /PC/.cache/thumbnails to ignore it
		ignoreBtns[0].click()
		await settle()

		assert.deepEqual(Array.from(vm.ignoredEmptyFolders), ['/PC/.cache/thumbnails'])
		assert.deepEqual(Array.from(vm.selectedModalEmptyFolders), ['/PC/NewEmpty'])
		assert.equal(vm.visibleModalEmptyFolders.length, 1, 'ignored folder is hidden from active cleanup list by default')
		assert.deepEqual(utils.loadUiPreferences().ignoredEmptyFolders, ['/PC/.cache/thumbnails'], 'persisted in localStorage preferences')

		// Re-running a scan remembers the ignored folder and only selects genuinely new empty folders
		await vm.scanEmptyFoldersInModal(false)
		await settle()
		assert.deepEqual(Array.from(vm.selectedModalEmptyFolders), ['/PC/NewEmpty'])
		assert.equal(vm.visibleModalEmptyFolders.length, 1)

		// Toggle "Show: 1" and verify the hidden folder displays the crossed-out eye icon (with strikethrough line)
		vm.$el.querySelector('.modal-toggle-ignored-folders-button').click()
		await settle()
		assert.equal(vm.visibleModalEmptyFolders.length, 2)
		const restoredBtn = vm.$el.querySelector('.empty-folder-ignore-button.is-ignored')
		assert.ok(restoredBtn, 'ignored folder shows active crossed-out eye button')
		assert.ok(restoredBtn.querySelector('.eye-icon--hidden'), 'shows crossed-out eye icon with strikethrough once folder is hidden')
		assert.equal(restoredBtn.querySelector('.eye-icon--visible'), null)
		restoredBtn.click()
		await settle()

		assert.deepEqual(Array.from(vm.ignoredEmptyFolders), [])
		assert.equal(vm.activeModalEmptyFolders.length, 2)

		// Bulk-ignore all selected folders, then restore all in one click via the reset controls
		vm.selectedModalEmptyFolders = ['/PC/.cache/thumbnails', '/PC/NewEmpty']
		vm.showIgnoredModalEmptyFolders = false
		await settle()
		vm.$el.querySelector('.modal-ignore-empty-folders-button').click()
		await settle()
		assert.deepEqual(Array.from(vm.ignoredEmptyFolders), ['/PC/.cache/thumbnails', '/PC/NewEmpty'])
		assert.equal(vm.visibleModalEmptyFolders.length, 0)
		assert.ok(vm.$el.querySelector('.modal-reset-ignored-folders-button'), 'renders reset ignored folders button in modal toolbar')
		assert.ok(vm.$el.querySelector('.modal-restore-all-ignored-button'), 'renders inline Restore all button when all detected folders are ignored')

		vm.$el.querySelector('.modal-reset-ignored-folders-button').click()
		await settle()
		assert.deepEqual(Array.from(vm.ignoredEmptyFolders), [], 'reset button clears all ignored empty folders')
		assert.equal(vm.visibleModalEmptyFolders.length, 2, 'all empty folders are visible again after reset')
		assert.deepEqual(Array.from(vm.selectedModalEmptyFolders), ['/PC/.cache/thumbnails', '/PC/NewEmpty'], 'restored folders are selected again')
		assert.deepEqual(utils.loadUiPreferences().ignoredEmptyFolders, [], 'cleared in localStorage preferences')

		// Verify parent folder with empty subfolders expands non-ignored children when selected alone after Unselect all
		vm.modalEmptyFolders = [
			{ path: '/Musik/FlashIntegro', name: 'FlashIntegro', depth: 2, hasEmptySubfolders: true, mtime: 1 },
			{ path: '/Musik/FlashIntegro/Sub', name: 'Sub', depth: 3, hasEmptySubfolders: false, mtime: 1 },
		]
		vm.selectedModalEmptyFolders = ['/Musik/FlashIntegro', '/Musik/FlashIntegro/Sub']
		await settle()

		// Click Unselect all, then select only /Musik/FlashIntegro
		vm.toggleSelectAllModalEmptyFolders()
		assert.deepEqual(Array.from(vm.selectedModalEmptyFolders), [])
		vm.toggleModalEmptyFolder('/Musik/FlashIntegro')
		assert.deepEqual(Array.from(vm.selectedModalEmptyFolders), ['/Musik/FlashIntegro'])

		const parentDeletePromise = vm.deleteSelectedModalEmptyFolders()
		await settle()
		vm.$el.querySelector('.empty-folders-modal .nc-confirm-dialog__button--danger').click()
		await parentDeletePromise
		await settle()

		assert.equal(vm.modalEmptyFolders.length, 0, 'both parent folder and its empty subfolder are deleted and removed from modal list')

		vm.$destroy()
		window.localStorage.clear()
	})
})
