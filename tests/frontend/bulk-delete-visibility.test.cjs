const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { Vue, loadComponent, loadModule, settle } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

const slotBox = tag => ({
	render(h) {
		return h(tag, { on: this.$listeners }, this.$slots.default)
	},
})

function createNavigationComponent() {
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})
	const NcAppNavigationItemStub = {
		name: 'NcAppNavigationItemStub',
		props: ['name', 'title', 'allowCollapse', 'open', 'active'],
		render(h) {
			return h('li', { attrs: { 'data-nav-name': this.name } }, this.$slots.default)
		},
	}
	const DuplicateListItem = loadComponent('src/components/DuplicateListItem.vue', {
		'@nextcloud/vue': { NcAppNavigationItem: NcAppNavigationItemStub },
		'@/tools/utils': utils,
	})
	const icon = slotBox('span')
	return loadComponent('src/components/DuplicateNavigation.vue', {
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
		'./SearchBar.vue': {
			render(h) {
				return h('input', { attrs: { type: 'search' } })
			},
		},
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
	})
}

function createAppComponent({ acknowledgedResponse, unacknowledgedResponse }) {
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})
	const icon = slotBox('span')
	const stub = name => ({
		name,
		props: ['duplicate', 'projectId', 'show'],
		render(h) {
			return h('div', { class: `stub-${name}` })
		},
	})
	return loadComponent('src/App.vue', {
		'@nextcloud/vue': {
			NcAppContent: slotBox('main'),
			NcContent: slotBox('div'),
			NcLoadingIcon: slotBox('span'),
			NcAppSettingsDialog: slotBox('section'),
			NcAppSettingsSection: slotBox('div'),
			NcButton: slotBox('button'),
			NcModal: slotBox('div'),
		},
		'./components/DuplicateNavigation.vue': {
			__esModule: true,
			default: createNavigationComponent(),
		},
		'./components/DuplicateDetails.vue': { __esModule: true, default: stub('duplicate-details') },
		'./components/OriginFoldersSettings.vue': { __esModule: true, default: stub('origin-folders') },
		'./components/ExcludedFoldersSettings.vue': { __esModule: true, default: stub('excluded-folders') },
		'./components/BulkDeletionSettings.vue': { __esModule: true, default: stub('bulk-deletion') },
		'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects-settings') },
		'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('project-duplicates') },
		'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('guide') },
		'./components/help/UsageExamples.vue': { __esModule: true, default: stub('examples') },
		'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
		'./components/SearchBar.vue': { __esModule: true, default: stub('search-bar') },
		'./components/FilterSettings.vue': { __esModule: true, default: stub('filter-settings') },
		'@/tools/api': {
			fetchDuplicates: async type => (type === 'acknowledged' ? acknowledgedResponse : unacknowledgedResponse),
			fetchProjects: async () => [],
		},
		'@/tools/utils': utils,
		'vue-material-design-icons/Folder': icon,
		'vue-material-design-icons/FolderRemove': icon,
		'vue-material-design-icons/FolderMultiple': icon,
		'vue-material-design-icons/Delete': icon,
		'vue-material-design-icons/FilterOutline': icon,
	})
}

describe('Issue 206: Single top-right Bulk Delete button and initial selection', () => {
	test('sidebar does not render a redundant second Bulk Delete button', async () => {
		const navSource = readFileSync(resolve(root, 'src/components/DuplicateNavigation.vue'), 'utf8')
		assert.ok(!navSource.includes('footer-actions'), 'Bulk Delete must not be in bottom footer-actions')
		assert.ok(!navSource.includes('sidebar-bulk-action'), 'redundant sidebar Bulk Delete button must be removed')

		const DuplicateNavigation = createNavigationComponent()
		const sampleDup = {
			id: 101,
			hash: 'hash-101',
			acknowledged: false,
			files: [
				{ id: 1, nodeId: 10, mimetype: 'image/jpeg', size: 2048, path: '/alice/files/Photos/img1.jpg' },
				{ id: 2, nodeId: 11, mimetype: 'image/jpeg', size: 2048, path: '/alice/files/Backup/img1.jpg' },
			],
		}

		const wrapper = new Vue({
			render(h) {
				return h(DuplicateNavigation, {
					props: {
						acknowledgedDuplicates: [],
						unacknowledgedDuplicates: [sampleDup],
						currentDuplicateId: null,
						activeView: 'details',
						hasDuplicates: true,
					},
				})
			},
		}).$mount()

		await settle()

		assert.equal(wrapper.$el.querySelector('.sidebar-bulk-action'), null, 'no Bulk Delete button in sidebar')
		assert.equal(wrapper.$el.querySelector('.bulk-delete-button'), null, 'no redundant Bulk Delete button in sidebar')

		wrapper.$destroy()
	})

	test('App topbar renders top-right Bulk Delete button with total duplicate count, auto-selects first duplicate on load, and supports Back to duplicates', async () => {
		const dupOne = {
			id: 42,
			hash: 'hash-42',
			acknowledged: false,
			files: [
				{ id: 1, nodeId: 100, mimetype: 'text/plain', size: 512, path: '/alice/files/a.txt' },
				{ id: 2, nodeId: 101, mimetype: 'text/plain', size: 512, path: '/alice/files/b.txt' },
			],
		}
		const App = createAppComponent({
			acknowledgedResponse: {
				entities: [],
				pagination: { currentPage: 1, totalPages: 1, totalItems: 3 },
			},
			unacknowledgedResponse: {
				entities: [dupOne],
				pagination: { currentPage: 1, totalPages: 2, totalItems: 65 },
			},
		})

		const vm = new Vue(App).$mount()
		await settle()

		// Auto-selected first unacknowledged duplicate on load
		assert.equal(vm.currentDuplicate.id, 42)

		// Topbar shows total count (65 + 3 = 68) and top-right Bulk Delete button
		const title = vm.$el.querySelector('.topbar-title')
		assert.ok(title)
		assert.equal(title.textContent.trim(), 'Duplicates (68)')

		const topBulkBtn = vm.$el.querySelector('.topbar-bulk-delete-button')
		assert.ok(topBulkBtn, 'top-right Bulk Delete button is visible immediately on load')

		// Even if currentDuplicate is cleared to null, top-right Bulk Delete stays accessible
		vm.currentDuplicate = null
		await settle()
		assert.ok(vm.$el.querySelector('.topbar-bulk-delete-button'))

		// Clicking top-right Bulk Delete switches to bulk-delete view and displays Back to duplicates button
		vm.$el.querySelector('.topbar-bulk-delete-button').click()
		await settle()
		assert.equal(vm.activeView, 'bulk-delete')
		assert.equal(vm.$el.querySelector('.topbar-title').textContent.trim(), 'Bulk Delete')
		assert.ok(vm.$el.querySelector('.stub-bulk-deletion'))

		const backBtn = vm.$el.querySelector('.topbar-back-button')
		assert.ok(backBtn, 'Back to duplicates button appears in topbar during bulk-delete view')
		backBtn.click()
		await settle()
		assert.equal(vm.activeView, 'details')
		assert.equal(vm.currentDuplicate.id, 42, 'returning from Bulk Delete restores first duplicate selection')

		// Issue 220: initial loading spinner is wrapped in a full-viewport centered container
		vm.isLoading = true
		await settle()
		const loadingContainer = vm.$el.querySelector('.app-loading-container')
		assert.ok(loadingContainer, 'initial loading spinner is wrapped in .app-loading-container for center alignment')

		vm.$destroy()
	})
})
