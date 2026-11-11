const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { Vue, loadComponent, loadModule, settle } = require('./helpers.cjs')

const slotBox = tag => ({
	render(h) {
		return h(tag, this.$slots.default)
	},
})

function navigationImports(fetchDuplicates) {
	const icon = slotBox('span')
	return {
		'@nextcloud/vue': {
			NcAppNavigation: {
				render(h) {
					return h('nav', this.$scopedSlots.list ? this.$scopedSlots.list() : this.$slots.default)
				},
			},
			NcAppNavigationItem: {
				props: ['name', 'allowCollapse', 'open', 'active'],
				render(h) {
					return h('section', [h('h4', this.name), this.$slots.default])
				},
			},
			NcButton: {
				render(h) {
					return h('button', { on: { click: () => this.$emit('click') } }, this.$slots.default)
				},
			},
		},
		'./DuplicateListItem.vue': {
			props: ['duplicate', 'isActive'],
			render(h) {
				return h('div', { attrs: { 'data-dup-id': this.duplicate.id } }, this.duplicate.hash)
			},
		},
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
		'@/tools/api': { fetchDuplicates },
		'@/tools/utils': loadModule('src/tools/utils.js', { './notifications': { showErrorNotification: () => {} } }),
	}
}

describe('Issue 194: server-side size sorting and minimum size filtering', () => {
	test('api.js appends sortBy and minSize only when active', async () => {
		const getCalls = []
		const api = loadModule('src/tools/api.js', {
			axios: {
				defaults: { headers: { common: {} } },
				get: async (url, config) => {
					getCalls.push({ url, config })
					return { data: { entities: [], pagination: { currentPage: 1, totalPages: 1 } } }
				},
				post: async () => ({ data: {} }),
				put: async () => ({ data: {} }),
				delete: async () => ({ data: {} }),
			},
			'@nextcloud/router': { generateUrl: path => path },
			'@/tools/notifications': { showSuccessNotification: () => {}, showErrorNotification: () => {} },
			'@/tools/utils': { normalizeItemPath: p => p },
		})

		await api.fetchDuplicates('unacknowledged', 50, 1)
		assert.equal(getCalls[0].url, '/apps/duplicatefinder/api/duplicates/unacknowledged?limit=50&page=1')

		await api.fetchDuplicates('unacknowledged', 50, 2, { sortBy: 'size-desc', minSize: 10485760 })
		assert.equal(
			getCalls[1].url,
			'/apps/duplicatefinder/api/duplicates/unacknowledged?limit=50&page=2&sortBy=size-desc&minSize=10485760',
		)

		await api.fetchDuplicatesForBulk(100, 1, { sortBy: 'size-asc', minSize: 1048576 })
		assert.deepEqual(getCalls[2].config.params, {
			onlyNonProtected: true,
			page: 1,
			limit: 100,
			sortBy: 'size-asc',
			minSize: 1048576,
		})
	})

	test('DuplicateNavigation emits query-options-changed and forwards options on Load More', async () => {
		const fetchCalls = []
		const fetchDuplicates = async (type, limit, page, options) => {
			fetchCalls.push({ type, limit, page, options })
			return { entities: [], pagination: { currentPage: page, totalPages: 3 } }
		}

		const DuplicateNavigation = loadComponent(
			'src/components/DuplicateNavigation.vue',
			navigationImports(fetchDuplicates),
		)

		const emitted = []
		const vm = new Vue({
			render(h) {
				return h(DuplicateNavigation, {
					ref: 'nav',
					props: {
						acknowledgedDuplicates: [],
						unacknowledgedDuplicates: [
							{ id: 1, hash: 'small', files: [{ id: 11, path: '/u/files/a.txt', size: 1024 }] },
							{ id: 2, hash: 'large', files: [{ id: 21, path: '/u/files/b.iso', size: 10 * 1024 * 1024 }] },
						],
						unacknowledgedPagination: { currentPage: 1, totalPages: 3 },
						initialSortOption: 'size-desc',
						initialMinSizeBytes: 1024 * 1024,
					},
					on: {
						'query-options-changed': payload => emitted.push(payload),
					},
				})
			},
		}).$mount()

		await settle()
		const nav = vm.$refs.nav

		// Preserves initial props across remounts and filters locally below 1 MB
		assert.equal(nav.hasActiveSortOrFilter, true)
		assert.equal(nav.filteredUnacknowledgedDuplicates.length, 1)
		assert.equal(nav.filteredUnacknowledgedDuplicates[0].hash, 'large')

		// Load More forwards active sortBy and minSize
		await nav.loadMoreUnacknowledgedDuplicates()
		assert.equal(fetchCalls.length, 1)
		assert.deepEqual(fetchCalls[0], {
			type: 'unacknowledged',
			limit: 50,
			page: 2,
			options: { sortBy: 'size-desc', minSize: 1048576 },
		})

		// Custom MB filter emits query-options-changed and resets page to 1
		nav.customMinSizeMb = '5'
		nav.applyCustomMinSize()
		assert.equal(nav.unacknowledgedPage, 1)
		assert.deepEqual(emitted[emitted.length - 1], {
			sortBy: 'size-desc',
			minSize: 5 * 1024 * 1024,
		})

		vm.$destroy()
	})

	test('BulkDeletionSettings forwards minSizeBytes and sortOption to fetchDuplicatesForBulk', async () => {
		const bulkCalls = []
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
				fetchDuplicatesForBulk: async (limit, page, options) => {
					bulkCalls.push({ limit, page, options })
					return {
						entities: [],
						pagination: { currentPage: 1, totalPages: 1, totalItems: 0, limit },
					}
				},
				deleteFiles: async () => ({ success: [], errors: [] }),
			},
			'@/tools/utils': {
				openFileInViewer: () => {},
				getTotalSizeOfDuplicate: d => (d.files || []).reduce((s, f) => s + f.size, 0),
			},
			'vue-material-design-icons/ChevronDown.vue': slotBox('span'),
			'@nextcloud/l10n': { translate: global.t },
		})

		const vm = new Vue(BulkDeletionSettings).$mount()
		await vm.setMinSizeBytes(10 * 1024 * 1024, false)
		vm.setSortOption('size-desc')
		await vm.performDryRun()

		assert.equal(bulkCalls.length, 1)
		assert.deepEqual(bulkCalls[0], {
			limit: 100,
			page: 1,
			options: { sortBy: 'size-desc', minSize: 10 * 1024 * 1024 },
		})

		vm.$destroy()
	})
})
