const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { Vue, loadComponent, loadModule, settle } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

const slotBox = tag => ({
	render(h) {
		return h(tag, this.$slots.default)
	},
})

function createNavigationHarness() {
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})

	const NcAppNavigationItemStub = {
		name: 'NcAppNavigationItemStub',
		props: ['name', 'title', 'allowCollapse', 'open', 'active'],
		render(h) {
			return h(
				'li',
				{
					class: {
						'nc-nav-item': true,
						'nc-nav-open': Boolean(this.open),
						'nc-nav-active': Boolean(this.active),
					},
					attrs: {
						'data-nav-name': this.name,
						title: this.title || this.name,
					},
				},
				[
					h('div', { class: 'app-navigation-entry' }, [
						h(
							'a',
							{
								class: 'app-navigation-entry-link',
								attrs: { href: '#' },
								on: {
									click: event => this.$emit('click', event),
								},
							},
							[this.$slots.icon, h('span', this.name)],
						),
						this.allowCollapse
							? h(
								'button',
								{
									class: 'icon-collapse',
									attrs: { type: 'button' },
									on: {
										click: event => {
											event.preventDefault()
											event.stopPropagation()
											this.$emit('update:open', !this.open)
										},
									},
								},
								[this.open ? '^' : 'v'],
							)
							: null,
						this.$slots.extra,
					]),
					this.allowCollapse && !this.open
						? null
						: h('ul', { class: 'app-navigation-entry__children' }, this.$slots.default),
				],
			)
		},
	}

	const DuplicateListItem = loadComponent('src/components/DuplicateListItem.vue', {
		'@nextcloud/vue': { NcAppNavigationItem: NcAppNavigationItemStub },
		'@/tools/utils': utils,
	})

	const icon = slotBox('span')
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

	return { DuplicateNavigation, DuplicateListItem, utils }
}

describe('Issues 207 and 206: dropdown selection contrast, row clickability, section highlighting and long paths', () => {
	test('Issue 207: selected item uses Nextcloud theme variables instead of white #f0f0f0 and stays readable after closing and reopening dropdown', async () => {
		const listItemSource = readFileSync(resolve(root, 'src/components/DuplicateListItem.vue'), 'utf8')
		assert.ok(!listItemSource.includes('#f0f0f0'), 'hardcoded light background #f0f0f0 must be removed')
		assert.ok(
			listItemSource.includes('var(--color-primary-element-light)'),
			'active item must use Nextcloud theme-aware --color-primary-element-light variable',
		)

		const { DuplicateNavigation } = createNavigationHarness()
		const unackDup = {
			id: 10,
			hash: 'abcd1234efgh',
			acknowledged: false,
			files: [
				{ id: 1, nodeId: 101, mimetype: 'image/png', size: 558, path: '/alice/files/Archive/Deep/Folder/spin-ltr-up-disabled.png' },
				{ id: 2, nodeId: 102, mimetype: 'image/png', size: 558, path: '/alice/files/Backup/Deep/Folder/spin-ltr-up-disabled.png' },
			],
		}

		const wrapper = new Vue({
			data: { currentDuplicateId: null },
			render(h) {
				return h(DuplicateNavigation, {
					ref: 'nav',
					props: {
						acknowledgedDuplicates: [],
						unacknowledgedDuplicates: [unackDup],
						currentDuplicateId: this.currentDuplicateId,
						activeView: 'details',
					},
					on: {
						'open-duplicate': dup => {
							this.currentDuplicateId = dup ? dup.id : null
						},
					},
				})
			},
		}).$mount()

		await settle()
		const nav = wrapper.$refs.nav

		// Select the duplicate inside Unacknowledged
		const fileLink = wrapper.$el.querySelector('li[data-nav-name="spin-ltr-up-disabled.png"] > .app-navigation-entry > .app-navigation-entry-link')
		assert.ok(fileLink)
		fileLink.click()
		await settle()

		assert.equal(wrapper.currentDuplicateId, 10)
		assert.equal(nav.unacknowledgedOpen, true, 'selecting a nested duplicate must not collapse its parent section')

		// Close Unacknowledged dropdown by clicking the row, then reopen it
		const unackRowLink = wrapper.$el.querySelector('li[data-nav-name="Unacknowledged"] > .app-navigation-entry > .app-navigation-entry-link')
		unackRowLink.click()
		await settle()
		assert.equal(nav.unacknowledgedOpen, false)

		unackRowLink.click()
		await settle()
		assert.equal(nav.unacknowledgedOpen, true)

		const reopenedItem = wrapper.$el.querySelector('li[data-nav-name="spin-ltr-up-disabled.png"]')
		assert.ok(reopenedItem.classList.contains('is-active'), 'selected item retains is-active class after reopening')
		assert.equal(
			reopenedItem.getAttribute('title'),
			'/Archive/Deep/Folder/spin-ltr-up-disabled.png\n/Backup/Deep/Folder/spin-ltr-up-disabled.png',
		)

		wrapper.$destroy()
	})

	test('Issue 206: clicking anywhere on Acknowledged or Unacknowledged row toggles collapse and highlights active section consistently', async () => {
		const { DuplicateNavigation } = createNavigationHarness()
		const ackDup = {
			id: 20,
			hash: 'ackhash1234',
			acknowledged: true,
			files: [
				{ id: 3, nodeId: 201, mimetype: 'text/plain', size: 1200, path: '/alice/files/Docs/report.txt' },
				{ id: 4, nodeId: 202, mimetype: 'text/plain', size: 1200, path: '/alice/files/Old/report.txt' },
			],
		}
		const unackDup = {
			id: 21,
			hash: 'unackhash1234',
			acknowledged: false,
			files: [
				{ id: 5, nodeId: 203, mimetype: 'text/plain', size: 2400, path: '/alice/files/Docs/notes.txt' },
				{ id: 6, nodeId: 204, mimetype: 'text/plain', size: 2400, path: '/alice/files/Old/notes.txt' },
			],
		}

		const wrapper = new Vue({
			data: { currentDuplicateId: 21, activeView: 'details' },
			render(h) {
				return h(DuplicateNavigation, {
					ref: 'nav',
					props: {
						acknowledgedDuplicates: [ackDup],
						unacknowledgedDuplicates: [unackDup],
						currentDuplicateId: this.currentDuplicateId,
						activeView: this.activeView,
					},
					on: {
						'open-duplicate': dup => {
							this.currentDuplicateId = dup ? dup.id : null
						},
					},
				})
			},
		}).$mount()

		await settle()
		const nav = wrapper.$refs.nav
		const ackSection = () => wrapper.$el.querySelector('li[data-nav-name="Acknowledged"]')
		const unackSection = () => wrapper.$el.querySelector('li[data-nav-name="Unacknowledged"]')

		// Initially Unacknowledged duplicate (21) is selected -> Unacknowledged is active
		assert.equal(unackSection().classList.contains('nc-nav-active'), true)
		assert.equal(ackSection().classList.contains('nc-nav-active'), false)

		// Clicking the Acknowledged row itself toggles open state AND highlights Acknowledged as active
		const ackRowLink = ackSection().querySelector(':scope > .app-navigation-entry > .app-navigation-entry-link')
		let defaultPrevented = false
		ackRowLink.dispatchEvent(
			Object.assign(new window.MouseEvent('click', { bubbles: true, cancelable: true }), {
				preventDefault() {
					defaultPrevented = true
				},
			}),
		)
		await settle()
		assert.equal(defaultPrevented, true, 'row click prevents default # anchor jump')
		assert.equal(nav.acknowledgedOpen, false)
		assert.equal(ackSection().classList.contains('nc-nav-active'), true)
		assert.equal(unackSection().classList.contains('nc-nav-active'), false)

		// Clicking the small chevron arrow on Acknowledged reopens it without double-toggling
		const ackArrow = ackSection().querySelector(':scope > .app-navigation-entry > .icon-collapse')
		ackArrow.click()
		await settle()
		assert.equal(nav.acknowledgedOpen, true)
		assert.equal(ackSection().classList.contains('nc-nav-active'), true)

		// Clicking the already-selected Unacknowledged item switches activeSection back to Unacknowledged
		const unackItemLink = wrapper.$el.querySelector('li[data-nav-name="notes.txt"] > .app-navigation-entry > .app-navigation-entry-link')
		unackItemLink.click()
		await settle()
		assert.equal(unackSection().classList.contains('nc-nav-active'), true)
		assert.equal(ackSection().classList.contains('nc-nav-active'), false)

		// Programmatic currentDuplicateId update (e.g. after acknowledging/resolving) also syncs activeSection
		wrapper.currentDuplicateId = 20
		await settle()
		assert.equal(ackSection().classList.contains('nc-nav-active'), true)
		assert.equal(unackSection().classList.contains('nc-nav-active'), false)

		// Switching to Bulk Delete clears active state on both sections
		wrapper.activeView = 'bulk-delete'
		await settle()
		assert.equal(unackSection().classList.contains('nc-nav-active'), false)
		assert.equal(ackSection().classList.contains('nc-nav-active'), false)

		wrapper.$destroy()
	})

	test('Issue 206: long folder and file paths expose full path tooltips and non-overlapping layout', async () => {
		const displaySource = readFileSync(resolve(root, 'src/components/DuplicateFileDisplay.vue'), 'utf8')
		assert.ok(
			!displaySource.includes('position: absolute'),
			'action buttons must not use position: absolute over long file paths',
		)
		assert.ok(displaySource.includes('overflow-wrap: anywhere'), 'file path wraps cleanly instead of colliding with buttons')

		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const Display = loadComponent('src/components/DuplicateFileDisplay.vue', {
			'@/tools/api': { deleteFile: async () => true },
			'@/tools/utils': utils,
			'@nextcloud/router': { generateUrl: url => url },
		})

		const longPath = '/alice/files/Backups/2026/Devices/Laptop/Documents/Encrypted/Archives/Subfolder/payload_2026_170_ITA.gpg'
		const expectedNormalized = '/Backups/2026/Devices/Laptop/Documents/Encrypted/Archives/Subfolder/payload_2026_170_ITA.gpg'

		const vm = new Vue({
			render(h) {
				return h(Display, {
					props: {
						file: {
							id: 1,
							nodeId: 500,
							path: longPath,
							mimetype: 'application/octet-stream',
							size: 4096,
							isInOriginFolder: false,
						},
						index: 0,
						duplicateAcknowledged: false,
						hasOtherFolders: true,
					},
				})
			},
		}).$mount()

		await settle()
		const pathParagraph = vm.$el.querySelector('.file-path')
		assert.ok(pathParagraph)
		assert.equal(pathParagraph.getAttribute('title'), expectedNormalized)
		assert.ok(pathParagraph.textContent.includes(expectedNormalized))

		vm.$destroy()
	})
})
