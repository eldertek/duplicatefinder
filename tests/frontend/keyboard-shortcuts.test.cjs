const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

const slotBox = tag => ({
	render(h) {
		return h(tag, this.$slots.default)
	},
})

function createRealDuplicateDetails(utils, clipboardImpl) {
	const selectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const metadataBadges = loadModule('src/tools/duplicateMetadataBadges.js')
	const deleteSafetyGuard = loadModule('src/tools/deleteSafetyGuard.js')
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const clipboardDependency = clipboardImpl === undefined
		? clipboardHelper
		: {
			copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl),
		}

	const Display = loadComponent('src/components/DuplicateFileDisplay.vue', {
		'@/tools/api': { deleteFile: async () => true },
		'@/tools/clipboardHelper': clipboardDependency,
		'@/tools/utils': utils,
		'@nextcloud/router': { generateUrl: url => url },
	})

	Vue.component('NcLoadingSpinner', { render: h => h('span') })

	return loadComponent('src/components/DuplicateDetails.vue', {
		'@/tools/api': {
			acknowledgeDuplicate: async () => {},
			unacknowledgeDuplicate: async () => {},
			deleteFiles: async () => ({ success: [], errors: [] }),
			findDuplicates: async () => {},
		},
		'@/tools/utils': utils,
		'@/tools/duplicateSelectionAndExport': selectionAndExport,
		'@/tools/duplicateStats': loadModule('src/tools/duplicateStats.js'),
		'@/tools/duplicateMetadataBadges': metadataBadges,
		'@/tools/deleteSafetyGuard': deleteSafetyGuard,
		'@/tools/duplicateGroupSummary': loadModule('src/tools/duplicateGroupSummary.js'),
		'@/tools/duplicateHashHelper': loadModule('src/tools/duplicateHashHelper.js'),
		'@/tools/clipboardHelper': clipboardDependency,
		'@nextcloud/dialogs': { showSuccess() {}, showError() {} },
		'./DuplicateFileDisplay.vue': { __esModule: true, default: Display },
	})
}

function createAppHarness({ acknowledged = [], unacknowledged = [], useRealDetails = false, clipboardImpl } = {}) {
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})
	const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
	const icon = slotBox('span')

	const SearchBar = loadComponent('src/components/SearchBar.vue', {
		'vue-material-design-icons/ChevronDown': icon,
	})

	const NcAppNavigationItemStub = {
		props: ['name', 'title', 'allowCollapse', 'open', 'active'],
		render(h) {
			return h('div', { class: ['nc-nav-item', { 'is-open': Boolean(this.open) }] }, [
				h('button', {
					attrs: { type: 'button' },
					on: { click: event => this.$emit('click', event) },
				}, this.name),
				this.$slots.default,
			])
		},
	}

	const DuplicateListItem = loadComponent('src/components/DuplicateListItem.vue', {
		'@nextcloud/vue': { NcAppNavigationItem: NcAppNavigationItemStub },
		'@/tools/utils': utils,
	})

	const DuplicateNavigation = loadComponent('src/components/DuplicateNavigation.vue', {
		'@nextcloud/vue': {
			NcAppNavigation: {
				render(h) {
					return h('nav', this.$scopedSlots.list ? this.$scopedSlots.list() : this.$slots.default)
				},
			},
			NcAppNavigationItem: NcAppNavigationItemStub,
			NcButton: slotBox('button'),
		},
		'./DuplicateListItem.vue': { __esModule: true, default: DuplicateListItem },
		'./SearchBar.vue': { __esModule: true, default: SearchBar },
		'vue-material-design-icons/CloseCircle': icon,
		'vue-material-design-icons/CheckCircle': icon,
		'vue-material-design-icons/Cog': icon,
		'vue-material-design-icons/Delete': icon,
		'vue-material-design-icons/HelpCircle': icon,
		'vue-material-design-icons/School': icon,
		'vue-material-design-icons/PlayCircle': icon,
		'vue-material-design-icons/FrequentlyAskedQuestions': icon,
		'vue-material-design-icons/FolderMultiple': icon,
		'vue-material-design-icons/FolderCog': icon,
		'vue-material-design-icons/Folder': icon,
		'@/tools/api': {
			fetchDuplicates: async () => ({ entities: [], pagination: { currentPage: 1, totalPages: 1 } }),
		},
		'@/tools/utils': utils,
		'@/tools/duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
		'@/tools/duplicatePreferences': loadModule('src/tools/duplicatePreferences.js'),
		'@/tools/duplicateSelectionAndExport': loadModule('src/tools/duplicateSelectionAndExport.js'),
		'@/tools/duplicateSortHelper': loadModule('src/tools/duplicateSortHelper.js'),
		'@/tools/duplicateStats': loadModule('src/tools/duplicateStats.js'),
	})

	const stub = name => ({
		name,
		props: ['duplicate', 'projectId', 'show', 'isScanning'],
		render(h) {
			return h('div', { class: `stub-${name}` })
		},
	})

	const detailsComponent = useRealDetails
		? createRealDuplicateDetails(utils, clipboardImpl)
		: stub('duplicate-details')

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
		'./components/DuplicateNavigation.vue': { __esModule: true, default: DuplicateNavigation },
		'./components/DuplicateDetails.vue': { __esModule: true, default: detailsComponent },
		'./components/OriginFoldersSettings.vue': { __esModule: true, default: stub('origin') },
		'./components/ExcludedFoldersSettings.vue': { __esModule: true, default: stub('excluded') },
		'./components/BulkDeletionSettings.vue': { __esModule: true, default: stub('bulk') },
		'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects') },
		'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('project-dups') },
		'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('guide') },
		'./components/help/UsageExamples.vue': { __esModule: true, default: stub('examples') },
		'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
		'./components/FilterSettings.vue': { __esModule: true, default: stub('filters') },
		'@/tools/api': {
			fetchDuplicates: async type => ({
				entities: type === 'acknowledged' ? acknowledged : unacknowledged,
				pagination: {
					currentPage: 1,
					totalPages: 1,
					totalItems: type === 'acknowledged' ? acknowledged.length : unacknowledged.length,
					hasMore: false,
				},
			}),
			fetchProjects: async () => [],
		},
		'@/tools/utils': utils,
		'@/tools/keyboardShortcuts': keyboardShortcuts,
		'vue-material-design-icons/Folder': icon,
		'vue-material-design-icons/FolderRemove': icon,
		'vue-material-design-icons/FolderMultiple': icon,
		'vue-material-design-icons/Delete': icon,
		'vue-material-design-icons/FilterOutline': icon,
	})

	return { App, keyboardShortcuts }
}

function makeDuplicate(id, name) {
	return {
		id,
		hash: `hash-${id}`,
		acknowledged: false,
		files: [
			{ id: id * 10 + 1, nodeId: id * 10 + 1, path: `/alice/files/A/${name}`, size: 1024, mimetype: 'text/plain' },
			{ id: id * 10 + 2, nodeId: id * 10 + 2, path: `/alice/files/B/${name}`, size: 1024, mimetype: 'text/plain' },
		],
	}
}

describe('Cycle 36: pro keyboard shortcuts for fast duplicate triage', () => {
	test('pure shortcut resolver maps j/k/ArrowDown/ArrowUp///?/Escape and ignores modifier or editable targets', () => {
		const {
			isEditableTarget,
			resolveShortcutAction,
			buildNavigableDuplicates,
			stepDuplicateSelection,
		} = loadModule('src/tools/keyboardShortcuts.js')

		assert.equal(resolveShortcutAction({ key: 'j' }), 'next-duplicate')
		assert.equal(resolveShortcutAction({ key: 'ArrowDown' }), 'next-duplicate')
		assert.equal(resolveShortcutAction({ key: 'k' }), 'previous-duplicate')
		assert.equal(resolveShortcutAction({ key: 'ArrowUp' }), 'previous-duplicate')
		assert.equal(resolveShortcutAction({ key: '/' }), 'focus-search')
		assert.equal(resolveShortcutAction({ key: '?', shiftKey: true }), 'toggle-help')
		assert.equal(resolveShortcutAction({ key: 'Escape' }, { isHelpOpen: false }), null)
		assert.equal(resolveShortcutAction({ key: 'Escape' }, { isHelpOpen: true }), 'close-help')
		assert.equal(resolveShortcutAction({ key: 'j' }, { isHelpOpen: true }), null)
		assert.equal(resolveShortcutAction({ key: '?' }, { isHelpOpen: true }), 'toggle-help')
		assert.equal(resolveShortcutAction({ key: 'j' }, { hasBlockingModal: true }), null)
		assert.equal(resolveShortcutAction({ key: '/', ctrlKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'k', metaKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'ArrowDown', altKey: true }), null)

		const input = document.createElement('input')
		const textarea = document.createElement('textarea')
		const select = document.createElement('select')
		const editableDiv = document.createElement('div')
		editableDiv.setAttribute('contenteditable', 'true')
		const editableChild = document.createElement('span')
		editableDiv.appendChild(editableChild)
		const nonEditableDiv = document.createElement('div')
		nonEditableDiv.setAttribute('contenteditable', 'false')

		assert.equal(isEditableTarget(input), true)
		assert.equal(isEditableTarget(textarea), true)
		assert.equal(isEditableTarget(select), true)
		assert.equal(isEditableTarget(editableDiv), true)
		assert.equal(isEditableTarget(editableChild), true)
		assert.equal(isEditableTarget(nonEditableDiv), false)

		for (const target of [input, textarea, select, editableDiv, editableChild]) {
			assert.equal(resolveShortcutAction({ key: 'j', target }), null)
			assert.equal(resolveShortcutAction({ key: 'k', target }), null)
			assert.equal(resolveShortcutAction({ key: '/', target }), null)
			assert.equal(resolveShortcutAction({ key: '?', target }), null)
		}

		// Empty list and min/max clamping
		assert.equal(stepDuplicateSelection([], null, 'next'), null)
		assert.equal(stepDuplicateSelection([], 1, 'previous'), null)

		const items = [{ id: 10 }, { id: 20 }, { id: 30 }]
		assert.equal(stepDuplicateSelection(items, null, 'next').id, 10)
		assert.equal(stepDuplicateSelection(items, 10, 'previous').id, 10)
		assert.equal(stepDuplicateSelection(items, 10, 'next').id, 20)
		assert.equal(stepDuplicateSelection(items, 20, 'next').id, 30)
		assert.equal(stepDuplicateSelection(items, 30, 'next').id, 30)
		assert.equal(stepDuplicateSelection(items, 30, 'previous').id, 20)

		const merged = buildNavigableDuplicates([{ id: 1 }], [{ id: 2 }, { id: 3 }])
		assert.deepEqual(merged.map(item => item.id), [1, 2, 3])
		assert.deepEqual(
			buildNavigableDuplicates([{ id: 1 }], [{ id: 2 }], { acknowledgedOpen: false }).map(item => item.id),
			[2],
		)
	})

	test('App.vue navigates duplicates with j/k/ArrowDown/ArrowUp and clamps cleanly at bounds and on empty list', async () => {
		window.localStorage.clear()
		const d1 = makeDuplicate(1, 'one.txt')
		const d2 = makeDuplicate(2, 'two.txt')
		const d3 = makeDuplicate(3, 'three.txt')

		const { App } = createAppHarness({
			acknowledged: [{ ...d1, acknowledged: true }],
			unacknowledged: [d2, d3],
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)
		try {
			await settle()
			// Initial selection starts on first unacknowledged (d2)
			assert.equal(vm.currentDuplicate.id, 2)

			// j advances to d3 (max bound)
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.currentDuplicate.id, 3)

			// ArrowDown at max bound clamps at d3
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.currentDuplicate.id, 3)

			// k moves back to d2, then ArrowUp moves to d1 (acknowledged section above)
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.currentDuplicate.id, 2)

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.currentDuplicate.id, 1)

			// k at min bound clamps at d1
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.currentDuplicate.id, 1)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}

		// Empty list stays safe without throwing
		const { App: EmptyApp } = createAppHarness({ acknowledged: [], unacknowledged: [] })
		const emptyVm = new Vue(EmptyApp).$mount()
		try {
			await settle()
			assert.equal(emptyVm.currentDuplicate, null)
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true }))
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(emptyVm.currentDuplicate, null)
		} finally {
			emptyVm.$destroy()
		}
	})

	test('App.vue focuses SearchBar on /, ignores shortcuts inside form fields, and toggles native <dialog> on ? / Escape', async () => {
		window.localStorage.clear()
		const d1 = makeDuplicate(1, 'alpha.txt')
		const d2 = makeDuplicate(2, 'beta.txt')

		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [d1, d2],
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)

		const externalTextarea = document.createElement('textarea')
		const externalSelect = document.createElement('select')
		const externalContentEditable = document.createElement('div')
		externalContentEditable.setAttribute('contenteditable', 'true')
		document.body.appendChild(externalTextarea)
		document.body.appendChild(externalSelect)
		document.body.appendChild(externalContentEditable)

		try {
			await settle()
			assert.equal(vm.currentDuplicate.id, 1)

			// "/" focuses SearchBar input and prevents default
			const slashEvent = new window.KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true })
			window.dispatchEvent(slashEvent)
			await settle()
			const searchInput = vm.$el.querySelector('input.search-input')
			assert.ok(searchInput, 'SearchBar input is rendered')
			assert.equal(document.activeElement, searchInput)
			assert.equal(slashEvent.defaultPrevented, true)

			// Typing j, k, ? inside SearchBar input or textarea/select/contenteditable must be ignored
			for (const field of [searchInput, externalTextarea, externalSelect, externalContentEditable]) {
				field.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true }))
				field.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true }))
			}
			await settle()
			assert.equal(vm.currentDuplicate.id, 1, 'j inside editable targets must not change selection')
			assert.equal(vm.shortcutsDialogOpen, false, '? inside editable targets must not open dialog')

			// Pressing Escape inside SearchBar blurs it so shortcuts resume
			searchInput.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
			await settle()
			assert.notEqual(document.activeElement, searchInput)

			// "?" opens native <dialog>
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			const dialog = vm.$el.querySelector('dialog.shortcuts-dialog')
			assert.ok(dialog, 'native <dialog> element exists')
			assert.equal(vm.shortcutsDialogOpen, true)
			assert.equal(dialog.open, true)
			assert.ok(dialog.querySelectorAll('kbd.shortcuts-dialog__kbd').length >= 5)

			// While dialog is open, j must not navigate duplicates
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.currentDuplicate.id, 1)

			// Escape closes the native <dialog>
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.shortcutsDialogOpen, false)
			assert.equal(dialog.open, false)

			// "?" toggles open and "?" again toggles closed
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(dialog.open, true)
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(dialog.open, false)
		} finally {
			vm.$destroy()
			mountNode.remove()
			externalTextarea.remove()
			externalSelect.remove()
			externalContentEditable.remove()
		}
	})

	test('keyboardShortcuts module has zero typographic dashes and zero XSS sinks', () => {
		const source = readFileSync(resolve(root, 'src/tools/keyboardShortcuts.js'), 'utf8')
		assert.equal(/[\u2013\u2014]/.test(source), false)
		assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(source), false)
	})
})

describe('Cycle 56: quick triage keyboard shortcuts o (Keep oldest) and c (Clear selection)', () => {
	test('resolveShortcutAction maps o/c, documents them in SHORTCUT_DEFINITIONS, and ignores editable targets, modifiers, and open <dialog>', () => {
		const {
			SHORTCUT_DEFINITIONS,
			resolveShortcutAction,
		} = loadModule('src/tools/keyboardShortcuts.js')

		const keepOldestDef = SHORTCUT_DEFINITIONS.find(def => def.id === 'keep-oldest')
		const clearSelectionDef = SHORTCUT_DEFINITIONS.find(def => def.id === 'clear-selection')
		assert.deepEqual(keepOldestDef, { id: 'keep-oldest', keys: ['o'], action: 'keep-oldest' })
		assert.deepEqual(clearSelectionDef, { id: 'clear-selection', keys: ['c'], action: 'clear-selection' })

		assert.equal(resolveShortcutAction({ key: 'o' }), 'keep-oldest')
		assert.equal(resolveShortcutAction({ key: 'c' }), 'clear-selection')

		// Modifiers must never be hijacked (e.g. Ctrl+c / Cmd+c copy)
		assert.equal(resolveShortcutAction({ key: 'o', ctrlKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'c', ctrlKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'c', metaKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'o', altKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'O', shiftKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'C', shiftKey: true }), null)

		// Ignored when help dialog or blocking modal is open
		assert.equal(resolveShortcutAction({ key: 'o' }, { isHelpOpen: true }), null)
		assert.equal(resolveShortcutAction({ key: 'c' }, { isHelpOpen: true }), null)
		assert.equal(resolveShortcutAction({ key: 'o' }, { hasBlockingModal: true }), null)
		assert.equal(resolveShortcutAction({ key: 'c' }, { hasBlockingModal: true }), null)

		// Ignored in editable targets and inside open <dialog>
		const input = document.createElement('input')
		const textarea = document.createElement('textarea')
		const select = document.createElement('select')
		const editableDiv = document.createElement('div')
		editableDiv.setAttribute('contenteditable', 'true')
		const dialog = document.createElement('dialog')
		dialog.setAttribute('open', '')
		const dialogButton = document.createElement('button')
		dialog.appendChild(dialogButton)

		for (const target of [input, textarea, select, editableDiv, dialog, dialogButton]) {
			assert.equal(resolveShortcutAction({ key: 'o', target }), null)
			assert.equal(resolveShortcutAction({ key: 'c', target }), null)
		}
	})

	test('App.vue -> DuplicateDetails.vue applies Keep oldest on o, clears on c, skips protected files, and ignores inside text fields or open <dialog>', async () => {
		window.localStorage.clear()
		const group = {
			id: 42,
			hash: 'hash-42',
			acknowledged: false,
			files: [
				{
					id: 421,
					nodeId: 421,
					path: '/alice/files/Origin/photo.jpg',
					size: 2048,
					mtime: 3000,
					mimetype: 'image/jpeg',
					isInOriginFolder: true,
				},
				{
					id: 422,
					nodeId: 422,
					path: '/alice/files/Archive/photo.jpg',
					size: 2048,
					mtime: 1000,
					mimetype: 'image/jpeg',
					isInOriginFolder: false,
				},
				{
					id: 423,
					nodeId: 423,
					path: '/alice/files/Inbox/photo.jpg',
					size: 2048,
					mtime: 2000,
					mimetype: 'image/jpeg',
					isInOriginFolder: false,
				},
			],
		}

		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [group],
			useRealDetails: true,
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)

		const externalTextarea = document.createElement('textarea')
		const externalContentEditable = document.createElement('div')
		externalContentEditable.setAttribute('contenteditable', 'true')
		const externalDialog = document.createElement('dialog')
		document.body.appendChild(externalTextarea)
		document.body.appendChild(externalContentEditable)
		document.body.appendChild(externalDialog)

		try {
			await settle()
			const detailsVm = vm.$refs.duplicateDetails
			assert.ok(detailsVm, 'DuplicateDetails ref is mounted')
			assert.equal(detailsVm.selectedFiles.length, 0)

			// 1. Pressing o applies Keep oldest (keeps mtime=1000 id=422, skips protected id=421, selects id=423)
			const oEvent = new window.KeyboardEvent('keydown', { key: 'o', bubbles: true, cancelable: true })
			window.dispatchEvent(oEvent)
			await settle()
			assert.equal(oEvent.defaultPrevented, true)
			assert.equal(detailsVm.activeKeepRule, 'oldest')
			assert.deepEqual(detailsVm.selectedFiles.map(file => file.id), [423])

			// 2. Typing c inside editable fields must NOT clear selection
			const searchInput = vm.$el.querySelector('input.search-input')
			assert.ok(searchInput)
			for (const field of [searchInput, externalTextarea, externalContentEditable]) {
				field.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'c', bubbles: true, cancelable: true }))
			}
			await settle()
			assert.deepEqual(detailsVm.selectedFiles.map(file => file.id), [423])

			// 3. Pressing c when an open <dialog> (shortcuts dialog) is open must NOT clear selection; o/c appear in dialog
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			const helpDialog = vm.$el.querySelector('dialog.shortcuts-dialog')
			assert.equal(helpDialog.open, true)
			const kbdLabels = Array.from(helpDialog.querySelectorAll('kbd.shortcuts-dialog__kbd')).map(el => el.textContent.trim())
			assert.ok(kbdLabels.includes('o'), 'help dialog documents o shortcut')
			assert.ok(kbdLabels.includes('c'), 'help dialog documents c shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'c', bubbles: true, cancelable: true }))
			await settle()
			assert.deepEqual(detailsVm.selectedFiles.map(file => file.id), [423])

			// Close help dialog
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(helpDialog.open, false)

			// 4. Pressing c when DuplicateDetails delete confirmation <dialog> is open must NOT clear selection
			detailsVm.$el.querySelector('button.delete-selected-button').click()
			await settle()
			const deleteDialog = detailsVm.$el.querySelector('dialog.nc-confirm-dialog')
			assert.ok(deleteDialog)
			assert.equal(detailsVm.showDeleteConfirmDialog, true)
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'c', bubbles: true, cancelable: true }))
			await settle()
			assert.deepEqual(detailsVm.selectedFiles.map(file => file.id), [423])
			detailsVm.resolveDeleteConfirm(false)
			await settle()

			// 5. Pressing c in normal state clears selection completely
			const cEvent = new window.KeyboardEvent('keydown', { key: 'c', bubbles: true, cancelable: true })
			window.dispatchEvent(cEvent)
			await settle()
			assert.equal(cEvent.defaultPrevented, true)
			assert.deepEqual(detailsVm.selectedFiles, [])
			assert.equal(detailsVm.activeKeepRule, null)

			// 6. Pressing o inside editable field or while external <dialog open> is open must NOT select anything
			for (const field of [searchInput, externalTextarea, externalContentEditable]) {
				field.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'o', bubbles: true, cancelable: true }))
			}
			await settle()
			assert.deepEqual(detailsVm.selectedFiles, [])

			externalDialog.setAttribute('open', '')
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'o', bubbles: true, cancelable: true }))
			await settle()
			assert.deepEqual(detailsVm.selectedFiles, [])
		} finally {
			vm.$destroy()
			mountNode.remove()
			externalTextarea.remove()
			externalContentEditable.remove()
			externalDialog.remove()
		}
	})

	test('o shortcut never selects protected-only groups and is ignored in bulk-delete view', async () => {
		window.localStorage.clear()
		const protectedOnlyGroup = {
			id: 77,
			hash: 'hash-77',
			acknowledged: false,
			files: [
				{
					id: 771,
					nodeId: 771,
					path: '/alice/files/OriginA/doc.pdf',
					size: 1024,
					mtime: 1000,
					mimetype: 'application/pdf',
					isInOriginFolder: true,
				},
				{
					id: 772,
					nodeId: 772,
					path: '/alice/files/OriginB/doc.pdf',
					size: 1024,
					mtime: 2000,
					mimetype: 'application/pdf',
					isInOriginFolder: true,
				},
			],
		}

		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [protectedOnlyGroup],
			useRealDetails: true,
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)
		try {
			await settle()
			const detailsVm = vm.$refs.duplicateDetails
			assert.ok(detailsVm)

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'o', bubbles: true, cancelable: true }))
			await settle()
			assert.deepEqual(detailsVm.selectedFiles, [])
			assert.equal(detailsVm.activeKeepRule, null)

			// In bulk-delete view, o and c are safely ignored
			vm.openBulkDelete()
			await settle()
			const bulkO = new window.KeyboardEvent('keydown', { key: 'o', bubbles: true, cancelable: true })
			const bulkC = new window.KeyboardEvent('keydown', { key: 'c', bubbles: true, cancelable: true })
			window.dispatchEvent(bulkO)
			window.dispatchEvent(bulkC)
			await settle()
			assert.equal(bulkO.defaultPrevented, false)
			assert.equal(bulkC.defaultPrevented, false)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue supports o and c shortcuts in project-duplicate view as well', async () => {
		window.localStorage.clear()
		const projectGroup = {
			id: 88,
			hash: 'hash-88',
			acknowledged: false,
			files: [
				{
					id: 881,
					nodeId: 881,
					path: '/alice/files/Older/report.pdf',
					size: 4096,
					mtime: 1000,
					mimetype: 'application/pdf',
					isInOriginFolder: false,
				},
				{
					id: 882,
					nodeId: 882,
					path: '/alice/files/Newer/report.pdf',
					size: 4096,
					mtime: 2000,
					mimetype: 'application/pdf',
					isInOriginFolder: false,
				},
			],
		}

		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [],
			useRealDetails: true,
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)
		try {
			await settle()
			vm.viewProjectDuplicate(projectGroup)
			await settle()

			const projectDetailsVm = vm.$refs.projectDuplicateDetails
			assert.ok(projectDetailsVm, 'projectDuplicateDetails ref is mounted')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'o', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(projectDetailsVm.activeKeepRule, 'oldest')
			assert.deepEqual(projectDetailsVm.selectedFiles.map(file => file.id), [882])

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'c', bubbles: true, cancelable: true }))
			await settle()
			assert.deepEqual(projectDetailsVm.selectedFiles, [])
			assert.equal(projectDetailsVm.activeKeepRule, null)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})
})

describe('Cycle 80: quick triage triad shortcuts n (Keep newest) and s (Keep shortest path)', () => {
	test('resolveShortcutAction maps n/s, documents them in SHORTCUT_DEFINITIONS, and ignores modifiers, editable targets, and open <dialog>', () => {
		const {
			SHORTCUT_DEFINITIONS,
			resolveShortcutAction,
		} = loadModule('src/tools/keyboardShortcuts.js')

		const keepNewestDef = SHORTCUT_DEFINITIONS.find(def => def.id === 'keep-newest')
		const keepShortestDef = SHORTCUT_DEFINITIONS.find(def => def.id === 'keep-shortest-path')
		assert.deepEqual(keepNewestDef, { id: 'keep-newest', keys: ['n'], action: 'keep-newest' })
		assert.deepEqual(keepShortestDef, { id: 'keep-shortest-path', keys: ['s'], action: 'keep-shortest-path' })

		assert.equal(resolveShortcutAction({ key: 'n' }), 'keep-newest')
		assert.equal(resolveShortcutAction({ key: 's' }), 'keep-shortest-path')

		// Modifiers and Shift must never be hijacked (e.g. Ctrl+s / Cmd+s save)
		assert.equal(resolveShortcutAction({ key: 'n', ctrlKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 's', ctrlKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 's', metaKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'n', altKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'N', shiftKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'S', shiftKey: true }), null)

		// Ignored when help dialog or blocking modal is open
		assert.equal(resolveShortcutAction({ key: 'n' }, { isHelpOpen: true }), null)
		assert.equal(resolveShortcutAction({ key: 's' }, { isHelpOpen: true }), null)
		assert.equal(resolveShortcutAction({ key: 'n' }, { hasBlockingModal: true }), null)
		assert.equal(resolveShortcutAction({ key: 's' }, { hasBlockingModal: true }), null)

		// Ignored in editable targets and inside open <dialog>
		const input = document.createElement('input')
		const textarea = document.createElement('textarea')
		const select = document.createElement('select')
		const editableDiv = document.createElement('div')
		editableDiv.setAttribute('contenteditable', 'true')
		const dialog = document.createElement('dialog')
		dialog.setAttribute('open', '')
		const dialogButton = document.createElement('button')
		dialog.appendChild(dialogButton)

		for (const target of [input, textarea, select, editableDiv, dialog, dialogButton]) {
			assert.equal(resolveShortcutAction({ key: 'n', target }), null)
			assert.equal(resolveShortcutAction({ key: 's', target }), null)
		}
	})

	test('App.vue -> DuplicateDetails.vue applies Keep newest on n, Keep shortest path on s, updates help <dialog>, and ignores editable fields or open <dialog>', async () => {
		window.localStorage.clear()
		const group = {
			id: 90,
			hash: 'hash-90',
			acknowledged: false,
			files: [
				{
					id: 901,
					nodeId: 901,
					path: '/alice/files/Origin/Very/Long/Folder/photo.jpg',
					size: 2048,
					mtime: 500,
					mimetype: 'image/jpeg',
					isInOriginFolder: true,
				},
				{
					id: 902,
					nodeId: 902,
					path: '/alice/files/B/photo.jpg',
					size: 2048,
					mtime: 1000,
					mimetype: 'image/jpeg',
					isInOriginFolder: false,
				},
				{
					id: 903,
					nodeId: 903,
					path: '/alice/files/Deep/Folder/photo.jpg',
					size: 2048,
					mtime: 3000,
					mimetype: 'image/jpeg',
					isInOriginFolder: false,
				},
			],
		}

		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [group],
			useRealDetails: true,
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)

		const externalTextarea = document.createElement('textarea')
		const externalContentEditable = document.createElement('div')
		externalContentEditable.setAttribute('contenteditable', 'true')
		const externalDialog = document.createElement('dialog')
		document.body.appendChild(externalTextarea)
		document.body.appendChild(externalContentEditable)
		document.body.appendChild(externalDialog)

		try {
			await settle()
			const detailsVm = vm.$refs.duplicateDetails
			assert.ok(detailsVm, 'DuplicateDetails ref is mounted')

			// 1. Pressing n keeps newest (mtime=3000 id=903), skips protected id=901, selects id=902
			const nEvent = new window.KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true })
			window.dispatchEvent(nEvent)
			await settle()
			assert.equal(nEvent.defaultPrevented, true)
			assert.equal(detailsVm.activeKeepRule, 'newest')
			assert.deepEqual(detailsVm.selectedFiles.map(file => file.id), [902])

			// 2. Pressing s inside editable targets must NOT switch to shortest_path
			const searchInput = vm.$el.querySelector('input.search-input')
			assert.ok(searchInput)
			for (const field of [searchInput, externalTextarea, externalContentEditable]) {
				field.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true }))
			}
			await settle()
			assert.equal(detailsVm.activeKeepRule, 'newest')
			assert.deepEqual(detailsVm.selectedFiles.map(file => file.id), [902])

			// 3. Help <dialog> documents n and s and blocks n/s while open
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			const helpDialog = vm.$el.querySelector('dialog.shortcuts-dialog')
			assert.equal(helpDialog.open, true)
			const kbdLabels = Array.from(helpDialog.querySelectorAll('kbd.shortcuts-dialog__kbd')).map(el => el.textContent.trim())
			assert.ok(kbdLabels.includes('n'), 'help dialog documents n shortcut')
			assert.ok(kbdLabels.includes('s'), 'help dialog documents s shortcut')
			assert.ok(helpDialog.textContent.includes('Keep newest copy in active group'))
			assert.ok(helpDialog.textContent.includes('Keep shortest path copy in active group'))

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(detailsVm.activeKeepRule, 'newest')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(helpDialog.open, false)

			// 4. Delete confirmation <dialog> blocks s
			detailsVm.$el.querySelector('button.delete-selected-button').click()
			await settle()
			assert.equal(detailsVm.showDeleteConfirmDialog, true)
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(detailsVm.activeKeepRule, 'newest')
			detailsVm.resolveDeleteConfirm(false)
			await settle()

			// 5. Pressing s in normal state keeps shortest path (id=902), skips protected id=901, selects id=903
			const sEvent = new window.KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true })
			window.dispatchEvent(sEvent)
			await settle()
			assert.equal(sEvent.defaultPrevented, true)
			assert.equal(detailsVm.activeKeepRule, 'shortest_path')
			assert.deepEqual(detailsVm.selectedFiles.map(file => file.id), [903])

			// 6. External <dialog open> blocks n
			externalDialog.setAttribute('open', '')
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(detailsVm.activeKeepRule, 'shortest_path')
			assert.deepEqual(detailsVm.selectedFiles.map(file => file.id), [903])
		} finally {
			vm.$destroy()
			mountNode.remove()
			externalTextarea.remove()
			externalContentEditable.remove()
			externalDialog.remove()
		}
	})

	test('n and s shortcuts never select protected-only groups, ignore bulk-delete view, and work in project-duplicate view', async () => {
		window.localStorage.clear()
		const protectedOnlyGroup = {
			id: 91,
			hash: 'hash-91',
			acknowledged: false,
			files: [
				{
					id: 911,
					nodeId: 911,
					path: '/alice/files/OriginA/doc.pdf',
					size: 1024,
					mtime: 1000,
					mimetype: 'application/pdf',
					isInOriginFolder: true,
				},
				{
					id: 912,
					nodeId: 912,
					path: '/alice/files/OriginB/Longer/doc.pdf',
					size: 1024,
					mtime: 2000,
					mimetype: 'application/pdf',
					isInOriginFolder: true,
				},
			],
		}
		const projectGroup = {
			id: 92,
			hash: 'hash-92',
			acknowledged: false,
			files: [
				{
					id: 921,
					nodeId: 921,
					path: '/alice/files/A/report.pdf',
					size: 4096,
					mtime: 1000,
					mimetype: 'application/pdf',
					isInOriginFolder: false,
				},
				{
					id: 922,
					nodeId: 922,
					path: '/alice/files/Newer/Folder/report.pdf',
					size: 4096,
					mtime: 2000,
					mimetype: 'application/pdf',
					isInOriginFolder: false,
				},
			],
		}

		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [protectedOnlyGroup],
			useRealDetails: true,
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)
		try {
			await settle()
			const detailsVm = vm.$refs.duplicateDetails
			assert.ok(detailsVm)

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true }))
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true }))
			await settle()
			assert.deepEqual(detailsVm.selectedFiles, [])
			assert.equal(detailsVm.activeKeepRule, null)

			// Bulk-delete view ignores n and s
			vm.openBulkDelete()
			await settle()
			const bulkN = new window.KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true })
			const bulkS = new window.KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true })
			window.dispatchEvent(bulkN)
			window.dispatchEvent(bulkS)
			await settle()
			assert.equal(bulkN.defaultPrevented, false)
			assert.equal(bulkS.defaultPrevented, false)

			// Project-duplicate view supports n and s
			vm.viewProjectDuplicate(projectGroup)
			await settle()
			const projectDetailsVm = vm.$refs.projectDuplicateDetails
			assert.ok(projectDetailsVm, 'projectDuplicateDetails ref is mounted')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(projectDetailsVm.activeKeepRule, 'newest')
			assert.deepEqual(projectDetailsVm.selectedFiles.map(file => file.id), [921])

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(projectDetailsVm.activeKeepRule, 'shortest_path')
			assert.deepEqual(projectDetailsVm.selectedFiles.map(file => file.id), [922])
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue and keyboardShortcuts.js preserve zero typographic dashes and zero XSS sinks', () => {
		for (const relPath of ['src/tools/keyboardShortcuts.js', 'src/App.vue']) {
			const source = readFileSync(resolve(root, relPath), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(source), false, `${relPath} must have zero U+2013/U+2014 dashes`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(source), false, `${relPath} must have zero XSS sinks`)
		}
	})
})

describe('Cycle 83: keyboard shortcut r (reset-filters) in DuplicateNavigation and App', () => {
	test('resolveShortcutAction maps r to reset-filters, documents it in SHORTCUT_DEFINITIONS, and ignores modifiers, editable targets, and open <dialog>', () => {
		const {
			SHORTCUT_DEFINITIONS,
			resolveShortcutAction,
		} = loadModule('src/tools/keyboardShortcuts.js')

		const resetFiltersDef = SHORTCUT_DEFINITIONS.find(def => def.id === 'reset-filters')
		assert.deepEqual(resetFiltersDef, { id: 'reset-filters', keys: ['r'], action: 'reset-filters' })

		assert.equal(resolveShortcutAction({ key: 'r' }), 'reset-filters')

		// Browser reload and modifiers must never be hijacked (Ctrl+r / Cmd+r / Alt+r / Shift+R)
		assert.equal(resolveShortcutAction({ key: 'r', ctrlKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'r', metaKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'r', altKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'R', shiftKey: true }), null)

		// Ignored when help dialog or blocking modal is open
		assert.equal(resolveShortcutAction({ key: 'r' }, { isHelpOpen: true }), null)
		assert.equal(resolveShortcutAction({ key: 'r' }, { hasBlockingModal: true }), null)

		// Ignored in editable targets and inside open <dialog>
		const input = document.createElement('input')
		const textarea = document.createElement('textarea')
		const select = document.createElement('select')
		const editableDiv = document.createElement('div')
		editableDiv.setAttribute('contenteditable', 'true')
		const dialog = document.createElement('dialog')
		dialog.setAttribute('open', '')
		const dialogButton = document.createElement('button')
		dialog.appendChild(dialogButton)

		for (const target of [input, textarea, select, editableDiv, dialog, dialogButton]) {
			assert.equal(resolveShortcutAction({ key: 'r', target }), null)
		}
	})

	test('App.vue -> DuplicateNavigation.vue resets all active filters on r, documents r in ? <dialog>, and ignores editable fields or open <dialog>', async () => {
		window.localStorage.clear()
		const photoGroup = {
			id: 101,
			hash: 'hash-101',
			acknowledged: false,
			files: [
				{ id: 1011, nodeId: 1011, path: '/alice/files/Photos/pic.jpg', size: 2 * 1024 * 1024, mtime: 1000, mimetype: 'image/jpeg' },
				{ id: 1012, nodeId: 1012, path: '/alice/files/Backup/pic.jpg', size: 2 * 1024 * 1024, mtime: 2000, mimetype: 'image/jpeg' },
				{ id: 1013, nodeId: 1013, path: '/alice/files/Archive/pic.jpg', size: 2 * 1024 * 1024, mtime: 3000, mimetype: 'image/jpeg' },
			],
		}
		const docGroup = {
			id: 102,
			hash: 'hash-102',
			acknowledged: false,
			files: [
				{ id: 1021, nodeId: 1021, path: '/alice/files/Docs/note.txt', size: 1024, mtime: 1000, mimetype: 'text/plain' },
				{ id: 1022, nodeId: 1022, path: '/alice/files/Copy/note.txt', size: 1024, mtime: 2000, mimetype: 'text/plain' },
			],
		}

		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [photoGroup, docGroup],
			useRealDetails: true,
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)

		const externalTextarea = document.createElement('textarea')
		const externalSelect = document.createElement('select')
		const externalContentEditable = document.createElement('div')
		externalContentEditable.setAttribute('contenteditable', 'true')
		const externalDialog = document.createElement('dialog')
		document.body.appendChild(externalTextarea)
		document.body.appendChild(externalSelect)
		document.body.appendChild(externalContentEditable)
		document.body.appendChild(externalDialog)

		try {
			await settle()
			const navVm = vm.$refs.duplicateNavigation
			const detailsVm = vm.$refs.duplicateDetails
			assert.ok(navVm, 'DuplicateNavigation ref is mounted')
			assert.ok(detailsVm, 'DuplicateDetails ref is mounted')

			// Activate multiple filters + sorting + search
			navVm.setCategoryFilter('images')
			navVm.toggleExtensionFilter('.jpg')
			navVm.folderQuery = '/Photos'
			navVm.setMinCopiesPreset('3plus')
			navVm.setSortOption('size-desc')
			navVm.setMinSizeBytes(1024 * 1024)
			navVm.handleSearch({ query: 'pic', type: 'simple' })
			if (navVm.$refs.searchBar) {
				navVm.$refs.searchBar.searchQuery = 'pic'
			}
			await settle()

			assert.equal(navVm.hasActiveFilters, true)
			const resetBtn = navVm.$el.querySelector('button.reset-filters-button')
			assert.ok(resetBtn, 'Reset filters button renders when filters are active')
			assert.equal(resetBtn.getAttribute('aria-keyshortcuts'), 'r')

			// 1. Pressing r inside editable inputs/select/textarea/contenteditable must NOT reset filters
			const searchInput = navVm.$el.querySelector('input.search-input')
			const folderInput = navVm.$el.querySelector('input.folder-filter-input')
			assert.ok(searchInput)
			assert.ok(folderInput)
			for (const field of [searchInput, folderInput, externalTextarea, externalSelect, externalContentEditable]) {
				field.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true }))
			}
			await settle()
			assert.equal(navVm.hasActiveFilters, true)
			assert.equal(navVm.selectedCategory, 'images')
			assert.equal(navVm.folderQuery, '/Photos')

			// 2. ? help <dialog> documents r and blocks r while open
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			const helpDialog = vm.$el.querySelector('dialog.shortcuts-dialog')
			assert.equal(helpDialog.open, true)
			const kbdLabels = Array.from(helpDialog.querySelectorAll('kbd.shortcuts-dialog__kbd')).map(el => el.textContent.trim())
			assert.ok(kbdLabels.includes('r'), 'help dialog documents r shortcut')
			assert.ok(helpDialog.textContent.includes('Reset all active filters and sorting'))

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(navVm.hasActiveFilters, true)

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(helpDialog.open, false)

			// 3. Delete confirmation <dialog> blocks r
			detailsVm.applyKeepRule('oldest')
			await settle()
			detailsVm.$el.querySelector('button.delete-selected-button').click()
			await settle()
			assert.equal(detailsVm.showDeleteConfirmDialog, true)
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(navVm.hasActiveFilters, true)
			detailsVm.resolveDeleteConfirm(false)
			await settle()

			// 4. External <dialog open> blocks r
			externalDialog.setAttribute('open', '')
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(navVm.hasActiveFilters, true)
			externalDialog.removeAttribute('open')

			// 5. Pressing r in normal details view resets all active filters and sorting in 1 key
			const rEvent = new window.KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true })
			window.dispatchEvent(rEvent)
			await settle()
			assert.equal(rEvent.defaultPrevented, true)
			assert.equal(navVm.selectedCategory, 'all')
			assert.equal(navVm.selectedExtension, '')
			assert.equal(navVm.folderQuery, '')
			assert.equal(navVm.selectedMinCopiesPreset, 'any')
			assert.equal(navVm.sortOption, 'none')
			assert.equal(navVm.minSizeBytes, 0)
			assert.equal(navVm.searchPattern, '')
			assert.equal(navVm.hasActiveFilters, false)
			assert.equal(navVm.$el.querySelector('button.reset-filters-button'), null)
			assert.equal(navVm.filteredUnacknowledgedDuplicates.length, 2)
		} finally {
			vm.$destroy()
			mountNode.remove()
			externalTextarea.remove()
			externalSelect.remove()
			externalContentEditable.remove()
			externalDialog.remove()
		}
	})

	test('r shortcut is a safe no-op when no filters are active or when activeView is bulk-delete', async () => {
		window.localStorage.clear()
		const d1 = makeDuplicate(110, 'alpha.txt')
		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [d1],
			useRealDetails: true,
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)
		try {
			await settle()
			const navVm = vm.$refs.duplicateNavigation
			assert.equal(navVm.hasActiveFilters, false)

			// No active filters -> r does not preventDefault
			const idleR = new window.KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true })
			window.dispatchEvent(idleR)
			await settle()
			assert.equal(idleR.defaultPrevented, false)

			// Active filter in bulk-delete view -> r is ignored
			navVm.folderQuery = '/A'
			await settle()
			assert.equal(navVm.hasActiveFilters, true)

			vm.openBulkDelete()
			await settle()
			const bulkR = new window.KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true })
			window.dispatchEvent(bulkR)
			await settle()
			assert.equal(bulkR.defaultPrevented, false)
			assert.equal(navVm.folderQuery, '/A')

			// Returning to details view allows r to reset the filter
			vm.closeBulkDelete()
			await settle()
			const detailsR = new window.KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true })
			window.dispatchEvent(detailsR)
			await settle()
			assert.equal(detailsR.defaultPrevented, true)
			assert.equal(navVm.folderQuery, '')
			assert.equal(navVm.hasActiveFilters, false)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('Cycle 83 touched files preserve zero typographic dashes and zero XSS sinks', () => {
		for (const relPath of [
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
			'src/components/DuplicateNavigation.vue',
		]) {
			const source = readFileSync(resolve(root, relPath), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(source), false, `${relPath} must have zero U+2013/U+2014 dashes`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(source), false, `${relPath} must have zero XSS sinks`)
		}
	})
})

describe('Cycle 90: keyboard shortcut y (copy-group-hash) in DuplicateDetails and App', () => {
	test('resolveShortcutAction maps y to copy-group-hash, documents it in SHORTCUT_DEFINITIONS, and ignores modifiers, editable targets, and open <dialog>', () => {
		const {
			SHORTCUT_DEFINITIONS,
			resolveShortcutAction,
		} = loadModule('src/tools/keyboardShortcuts.js')

		const copyHashDef = SHORTCUT_DEFINITIONS.find(def => def.id === 'copy-group-hash')
		assert.deepEqual(copyHashDef, { id: 'copy-group-hash', keys: ['y'], action: 'copy-group-hash' })

		assert.equal(resolveShortcutAction({ key: 'y' }), 'copy-group-hash')

		// Browser redo/modifiers and Shift must never be hijacked (Ctrl+y / Cmd+y / Alt+y / Shift+Y)
		assert.equal(resolveShortcutAction({ key: 'y', ctrlKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'y', metaKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'y', altKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'Y', shiftKey: true }), null)

		// Ignored when help dialog or blocking modal is open
		assert.equal(resolveShortcutAction({ key: 'y' }, { isHelpOpen: true }), null)
		assert.equal(resolveShortcutAction({ key: 'y' }, { hasBlockingModal: true }), null)

		// Ignored in editable targets and inside open <dialog>
		const input = document.createElement('input')
		const textarea = document.createElement('textarea')
		const select = document.createElement('select')
		const editableDiv = document.createElement('div')
		editableDiv.setAttribute('contenteditable', 'true')
		const dialog = document.createElement('dialog')
		dialog.setAttribute('open', '')
		const dialogButton = document.createElement('button')
		dialog.appendChild(dialogButton)

		for (const target of [input, textarea, select, editableDiv, dialog, dialogButton]) {
			assert.equal(resolveShortcutAction({ key: 'y', target }), null)
		}
	})

	test('App.vue -> DuplicateDetails.vue copies group hash on y, sets aria-keyshortcuts="y", documents y in ? <dialog>, and ignores editable fields, modifiers, or open <dialog>', async () => {
		window.localStorage.clear()
		const copiedValues = []
		const group = {
			id: 201,
			hash: '0123456789abcdef0123456789abcdef',
			acknowledged: false,
			files: [
				{ id: 2011, nodeId: 2011, path: '/alice/files/A/archive.zip', size: 4096, mtime: 1000, mimetype: 'application/zip' },
				{ id: 2012, nodeId: 2012, path: '/alice/files/B/archive.zip', size: 4096, mtime: 2000, mimetype: 'application/zip' },
			],
		}

		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [group],
			useRealDetails: true,
			clipboardImpl: {
				writeText: async value => {
					copiedValues.push(value)
				},
			},
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)

		const externalTextarea = document.createElement('textarea')
		const externalSelect = document.createElement('select')
		const externalContentEditable = document.createElement('div')
		externalContentEditable.setAttribute('contenteditable', 'true')
		const externalDialog = document.createElement('dialog')
		document.body.appendChild(externalTextarea)
		document.body.appendChild(externalSelect)
		document.body.appendChild(externalContentEditable)
		document.body.appendChild(externalDialog)

		try {
			await settle()
			const detailsVm = vm.$refs.duplicateDetails
			assert.ok(detailsVm, 'DuplicateDetails ref is mounted')

			const copyHashButton = detailsVm.$el.querySelector('button.group-header-summary__copy-hash-button')
			assert.ok(copyHashButton, 'Copy hash button is rendered')
			assert.equal(copyHashButton.getAttribute('aria-keyshortcuts'), 'y')

			// 1. Typing y inside editable inputs/select/textarea/contenteditable must NOT copy
			const searchInput = vm.$el.querySelector('input.search-input')
			const folderInput = vm.$el.querySelector('input.folder-filter-input')
			assert.ok(searchInput)
			assert.ok(folderInput)
			for (const field of [searchInput, folderInput, externalTextarea, externalSelect, externalContentEditable]) {
				field.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'y', bubbles: true, cancelable: true }))
			}
			await settle()
			assert.deepEqual(copiedValues, [])
			assert.equal(detailsVm.hashCopyStatus, 'idle')

			// 2. Modifiers (Ctrl+y / Cmd+y / Alt+y / Shift+Y) must NOT copy or preventDefault
			for (const init of [
				{ key: 'y', ctrlKey: true },
				{ key: 'y', metaKey: true },
				{ key: 'y', altKey: true },
				{ key: 'Y', shiftKey: true },
			]) {
				const modEvent = new window.KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true })
				window.dispatchEvent(modEvent)
				assert.equal(modEvent.defaultPrevented, false)
			}
			await settle()
			assert.deepEqual(copiedValues, [])

			// 3. ? help <dialog> documents y and blocks y while open
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			const helpDialog = vm.$el.querySelector('dialog.shortcuts-dialog')
			assert.equal(helpDialog.open, true)
			const kbdLabels = Array.from(helpDialog.querySelectorAll('kbd.shortcuts-dialog__kbd')).map(el => el.textContent.trim())
			assert.ok(kbdLabels.includes('y'), 'help dialog documents y shortcut')
			assert.ok(helpDialog.textContent.includes('Copy active group hash'))

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'y', bubbles: true, cancelable: true }))
			await settle()
			assert.deepEqual(copiedValues, [])

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(helpDialog.open, false)

			// 4. Delete confirmation <dialog> blocks y
			detailsVm.applyKeepRule('oldest')
			await settle()
			detailsVm.$el.querySelector('button.delete-selected-button').click()
			await settle()
			assert.equal(detailsVm.showDeleteConfirmDialog, true)
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'y', bubbles: true, cancelable: true }))
			await settle()
			assert.deepEqual(copiedValues, [])
			detailsVm.resolveDeleteConfirm(false)
			await settle()

			// 5. External <dialog open> blocks y
			externalDialog.setAttribute('open', '')
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'y', bubbles: true, cancelable: true }))
			await settle()
			assert.deepEqual(copiedValues, [])
			externalDialog.removeAttribute('open')

			// 6. Pressing y in normal view copies full group hash and updates live status
			const yEvent = new window.KeyboardEvent('keydown', { key: 'y', bubbles: true, cancelable: true })
			window.dispatchEvent(yEvent)
			await settle()
			assert.equal(yEvent.defaultPrevented, true)
			assert.deepEqual(copiedValues, ['0123456789abcdef0123456789abcdef'])
			assert.equal(detailsVm.hashCopyStatus, 'copied')
			assert.equal(detailsVm.hashCopyStatusMessage, 'Copied')
			const statusEl = detailsVm.$el.querySelector('.group-header-summary__copy-status')
			assert.ok(statusEl)
			assert.equal(statusEl.textContent.trim(), 'Copied')
		} finally {
			vm.$destroy()
			mountNode.remove()
			externalTextarea.remove()
			externalSelect.remove()
			externalContentEditable.remove()
			externalDialog.remove()
		}
	})

	test('y shortcut is a safe no-op when hash is missing or in bulk-delete view, works in project-duplicate view, and reports clipboard failures cleanly', async () => {
		window.localStorage.clear()
		const copiedValues = []
		let shouldFailClipboard = false

		const missingHashGroup = {
			id: 202,
			hash: '',
			acknowledged: false,
			files: [
				{ id: 2021, nodeId: 2021, path: '/alice/files/A/doc.txt', size: 512, mtime: 1000, mimetype: 'text/plain' },
				{ id: 2022, nodeId: 2022, path: '/alice/files/B/doc.txt', size: 512, mtime: 2000, mimetype: 'text/plain' },
			],
		}
		const projectGroup = {
			id: 203,
			hash: 'fedcba9876543210fedcba9876543210',
			acknowledged: false,
			files: [
				{ id: 2031, nodeId: 2031, path: '/alice/files/P1/spec.pdf', size: 1024, mtime: 1000, mimetype: 'application/pdf' },
				{ id: 2032, nodeId: 2032, path: '/alice/files/P2/spec.pdf', size: 1024, mtime: 2000, mimetype: 'application/pdf' },
			],
		}

		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [missingHashGroup],
			useRealDetails: true,
			clipboardImpl: {
				writeText: async value => {
					if (shouldFailClipboard) {
						throw new Error('Clipboard denied')
					}
					copiedValues.push(value)
				},
			},
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)
		try {
			await settle()
			// Missing hash -> safe no-op
			const noHashEvent = new window.KeyboardEvent('keydown', { key: 'y', bubbles: true, cancelable: true })
			window.dispatchEvent(noHashEvent)
			await settle()
			assert.equal(noHashEvent.defaultPrevented, false)
			assert.deepEqual(copiedValues, [])

			// Bulk-delete view -> ignored
			vm.openBulkDelete()
			await settle()
			const bulkY = new window.KeyboardEvent('keydown', { key: 'y', bubbles: true, cancelable: true })
			window.dispatchEvent(bulkY)
			await settle()
			assert.equal(bulkY.defaultPrevented, false)
			assert.deepEqual(copiedValues, [])

			// Project-duplicate view -> copies group hash
			vm.viewProjectDuplicate(projectGroup)
			await settle()
			const projectDetailsVm = vm.$refs.projectDuplicateDetails
			assert.ok(projectDetailsVm, 'projectDuplicateDetails ref is mounted')

			const projectY = new window.KeyboardEvent('keydown', { key: 'y', bubbles: true, cancelable: true })
			window.dispatchEvent(projectY)
			await settle()
			assert.equal(projectY.defaultPrevented, true)
			assert.deepEqual(copiedValues, ['fedcba9876543210fedcba9876543210'])
			assert.equal(projectDetailsVm.hashCopyStatus, 'copied')

			// Clipboard failure -> Copy failed without uncaught throw
			shouldFailClipboard = true
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'y', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(projectDetailsVm.hashCopyStatus, 'error')
			assert.equal(projectDetailsVm.hashCopyStatusMessage, 'Copy failed')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('Cycle 90 touched files preserve zero typographic dashes and zero XSS sinks', () => {
		for (const relPath of [
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
			'src/components/DuplicateDetails.vue',
		]) {
			const source = readFileSync(resolve(root, relPath), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(source), false, `${relPath} must have zero U+2013/U+2014 dashes`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(source), false, `${relPath} must have zero XSS sinks`)
		}
	})
})
