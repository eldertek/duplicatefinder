const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync, readdirSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

const slotBox = tag => ({
	render(h) {
		return h(tag, this.$slots.default)
	},
})

function walkSrc(dir, out = []) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const fullPath = join(dir, entry.name)
		if (entry.isDirectory()) {
			walkSrc(fullPath, out)
		} else if (/\.(vue|js|scss|css)$/.test(entry.name)) {
			out.push(fullPath)
		}
	}
	return out
}

describe('Cycle 35: logical CSS, mobile 375px ergonomics, and keyboard accessibility', () => {
	test('SearchBar uses semantic button controls, ARIA attributes, and Escape dismissal', async () => {
		const SearchBar = loadComponent('src/components/SearchBar.vue', {
			'vue-material-design-icons/ChevronDown': slotBox('span'),
		})

		const emitted = []
		const vm = new Vue({
			render(h) {
				return h(SearchBar, {
					on: {
						search: payload => emitted.push(payload),
					},
				})
			},
		}).$mount()
		await settle()

		const input = vm.$el.querySelector('input.search-input')
		assert.ok(input.getAttribute('aria-label'), 'search input exposes aria-label')

		const toggle = vm.$el.querySelector('button.search-type-toggle')
		assert.ok(toggle, 'search type toggle must be a semantic <button>')
		assert.equal(toggle.getAttribute('aria-expanded'), 'false')
		assert.equal(toggle.getAttribute('aria-haspopup'), 'listbox')

		toggle.click()
		await settle()
		assert.equal(toggle.getAttribute('aria-expanded'), 'true')

		const options = Array.from(vm.$el.querySelectorAll('button.search-type-option'))
		assert.equal(options.length, 3)
		assert.equal(options[0].getAttribute('role'), 'option')
		assert.equal(options[0].getAttribute('aria-selected'), 'true')

		options[1].click()
		await settle()
		assert.equal(toggle.getAttribute('aria-expanded'), 'false')
		assert.equal(emitted[emitted.length - 1].type, 'wildcard')

		toggle.click()
		await settle()
		assert.equal(toggle.getAttribute('aria-expanded'), 'true')
		const listbox = vm.$el.querySelector('[role="listbox"]')
		listbox.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
		await settle()
		assert.equal(toggle.getAttribute('aria-expanded'), 'false')
	})

	test('DuplicateFileDisplay thumbnail supports keyboard activation (Enter/Space)', async () => {
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const Display = loadComponent('src/components/DuplicateFileDisplay.vue', {
			'@/tools/api': { deleteFile: async () => true },
			'@/tools/clipboardHelper': loadModule('src/tools/clipboardHelper.js'),
			'@/tools/duplicatePathDiff': loadModule('src/tools/duplicatePathDiff.js'),
			'@/tools/utils': utils,
			'@nextcloud/router': { generateUrl: url => url },
		})

		const opened = []
		const originalOpen = global.window.open
		global.window.open = url => opened.push(url)

		try {
			const vm = new Vue({
				render(h) {
					return h(Display, {
						props: {
							file: {
								id: 1,
								nodeId: 99,
								path: '/alice/files/Photos/pic.jpg',
								mimetype: 'image/jpeg',
								size: 1024,
								isInOriginFolder: false,
							},
							index: 0,
							duplicateAcknowledged: false,
							hasOtherFolders: false,
						},
					})
				},
			}).$mount()
			await settle()

			const thumb = vm.$el.querySelector('.thumbnail')
			assert.equal(thumb.getAttribute('role'), 'button')
			assert.equal(thumb.getAttribute('tabindex'), '0')
			assert.ok(thumb.getAttribute('aria-label'))

			thumb.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
			thumb.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: ' ', bubbles: true }))
			await settle()
			assert.equal(opened.length, 2)
		} finally {
			global.window.open = originalOpen
		}
	})

	test('DuplicateNavigation and DuplicateDetails expose semantic menu buttons, ARIA labels, and polite live regions', async () => {
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const icon = slotBox('span')

		const DuplicateNavigation = loadComponent('src/components/DuplicateNavigation.vue', {
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
				NcButton: slotBox('button'),
			},
			'./DuplicateListItem.vue': slotBox('div'),
			'./SearchBar.vue': slotBox('div'),
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
			'@/tools/duplicateMetadataBadges': loadModule('src/tools/duplicateMetadataBadges.js'),
		})

		const navVm = new Vue({
			render(h) {
				return h(DuplicateNavigation, {
					props: {
						acknowledgedDuplicates: [],
						unacknowledgedDuplicates: [],
					},
				})
			},
		}).$mount()
		await settle()

		const sortBtn = navVm.$el.querySelector('button.icon-only-button')
		assert.ok(sortBtn.getAttribute('aria-label'))
		assert.equal(sortBtn.getAttribute('aria-expanded'), 'false')
		sortBtn.click()
		await settle()
		assert.equal(sortBtn.getAttribute('aria-expanded'), 'true')
		assert.ok(navVm.$el.querySelectorAll('button.sort-option').length >= 3, 'sort options are semantic buttons')

		const liveRegions = navVm.$el.querySelectorAll('[aria-live="polite"]')
		assert.ok(liveRegions.length >= 2, 'empty duplicate sections use aria-live="polite"')

		const Details = loadComponent('src/components/DuplicateDetails.vue', {
			'@/tools/api': { acknowledgeDuplicate: async () => {}, unacknowledgeDuplicate: async () => {}, deleteFiles: async () => ({ success: [], errors: [] }), findDuplicates: async () => {} },
			'@/tools/utils': utils,
			'@/tools/duplicateSelectionAndExport': loadModule('src/tools/duplicateSelectionAndExport.js'),
			'@/tools/duplicateSortHelper': loadModule('src/tools/duplicateSortHelper.js'),
			'@/tools/duplicateStats': loadModule('src/tools/duplicateStats.js'),
			'@/tools/duplicateMetadataBadges': loadModule('src/tools/duplicateMetadataBadges.js'),
			'@/tools/duplicatePathDiff': loadModule('src/tools/duplicatePathDiff.js'),
			'@/tools/deleteSafetyGuard': loadModule('src/tools/deleteSafetyGuard.js'),
			'@/tools/duplicateGroupSummary': loadModule('src/tools/duplicateGroupSummary.js'),
			'@/tools/duplicateHashHelper': loadModule('src/tools/duplicateHashHelper.js'),
			'@/tools/clipboardHelper': loadModule('src/tools/clipboardHelper.js'),
			'@nextcloud/dialogs': { showSuccess() {}, showError() {} },
			'./DuplicateCompareView.vue': slotBox('div'),
			'./DuplicateFileDisplay.vue': slotBox('div'),
		})
		Vue.component('NcLoadingSpinner', { render: h => h('span') })

		const emptyDetailsVm = new Vue({
			render(h) {
				return h(Details, { props: { duplicate: null } })
			},
		}).$mount()
		await settle()
		assert.equal(emptyDetailsVm.$el.querySelector('.emptycontent').getAttribute('aria-live'), 'polite')

		const populatedDetailsVm = new Vue({
			render(h) {
				return h(Details, {
					props: {
						duplicate: {
							id: 1,
							hash: 'abc12345',
							acknowledged: false,
							files: [
								{ id: 1, nodeId: 11, path: '/u/files/a/one.txt', size: 100, mimetype: 'text/plain', isInOriginFolder: false },
								{ id: 2, nodeId: 12, path: '/u/files/b/one.txt', size: 100, mimetype: 'text/plain', isInOriginFolder: false },
							],
						},
					},
				})
			},
		}).$mount()
		await settle()

		const rowCheckboxes = populatedDetailsVm.$el.querySelectorAll('input.file-row-checkbox:not(.file-header-checkbox)')
		assert.equal(rowCheckboxes.length, 2)
		assert.ok(rowCheckboxes[0].getAttribute('aria-label').includes('/u/files/a/one.txt'))
		assert.equal(populatedDetailsVm.$el.querySelector('.dropdown-toggle').getAttribute('aria-expanded'), 'false')
	})

	test('source tree has zero typographic dashes, zero XSS sinks, and keeps focus-visible & 44px mobile touch guards', () => {
		const files = walkSrc(resolve(root, 'src'))
		for (const filePath of files) {
			const content = readFileSync(filePath, 'utf8')
			assert.ok(!/[\u2013\u2014]/.test(content), `No U+2013/U+2014 dash allowed in ${filePath}`)
			if (!filePath.endsWith('faqParser.js')) {
				assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(content), `No DOM XSS sink allowed in ${filePath}`)
			}
		}

		for (const relPath of [
			'src/App.vue',
			'src/components/DuplicateDetails.vue',
			'src/components/DuplicateFileDisplay.vue',
			'src/components/DuplicateNavigation.vue',
			'src/components/SearchBar.vue',
		]) {
			const content = readFileSync(resolve(root, relPath), 'utf8')
			assert.ok(content.includes(':focus-visible'), `${relPath} must style :focus-visible`)
			assert.ok(content.includes('44px'), `${relPath} must enforce >= 44px mobile touch targets`)
		}
	})
})
