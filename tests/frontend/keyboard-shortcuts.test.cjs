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

function createAppHarness({ acknowledged = [], unacknowledged = [] } = {}) {
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
		'@/tools/duplicateSelectionAndExport': loadModule('src/tools/duplicateSelectionAndExport.js'),
	})

	const stub = name => ({
		name,
		props: ['duplicate', 'projectId', 'show', 'isScanning'],
		render(h) {
			return h('div', { class: `stub-${name}` })
		},
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
		'./components/DuplicateNavigation.vue': { __esModule: true, default: DuplicateNavigation },
		'./components/DuplicateDetails.vue': { __esModule: true, default: stub('duplicate-details') },
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
