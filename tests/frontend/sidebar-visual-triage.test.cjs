const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
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
	const duplicateStats = loadModule('src/tools/duplicateStats.js')

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
		'@/tools/duplicateStats': duplicateStats,
		'@/tools/utils': utils,
	})

	const icon = slotBox('span')
	const SearchBar = loadComponent('src/components/SearchBar.vue', {
		'vue-material-design-icons/ChevronDown': icon,
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
		'@/tools/duplicateStats': duplicateStats,
	})

	return { DuplicateNavigation, DuplicateListItem, duplicateStats }
}

describe('Cycle 113: WizTree-inspired sidebar visual triage density', () => {
	test('computeMaxReclaimableBytes and computeListItemMetrics compute accurate, clamped metrics', () => {
		const {
			computeMaxReclaimableBytes,
			computeListItemMetrics,
		} = loadModule('src/tools/duplicateStats.js')

		assert.equal(computeMaxReclaimableBytes(null), 0)
		assert.equal(computeMaxReclaimableBytes([]), 0)

		const mb = 1024 * 1024
		const groupSmall = {
			id: 1,
			hash: 'aaa',
			files: [
				{ id: 1, path: '/alice/files/a.jpg', size: 2 * mb, isInOriginFolder: false },
				{ id: 2, path: '/alice/files/copy/a.jpg', size: 2 * mb, isInOriginFolder: false },
			],
		} // reclaimable: 2 MB
		const groupMedium = {
			id: 2,
			hash: 'bbb',
			files: [
				{ id: 3, path: '/alice/files/Origin/b.mp4', size: 10 * mb, isInOriginFolder: true },
				{ id: 4, path: '/alice/files/b1.mp4', size: 10 * mb, isInOriginFolder: false },
				{ id: 5, path: '/alice/files/b2.mp4', size: 10 * mb, isInOriginFolder: false },
			],
		} // reclaimable: 20 MB
		const groupTiny = {
			id: 3,
			hash: 'ccc',
			files: [
				{ id: 6, path: '/alice/files/tiny.txt', size: 100, isInOriginFolder: false },
				{ id: 7, path: '/alice/files/tiny2.txt', size: 100, isInOriginFolder: false },
			],
		} // reclaimable: 100 B

		const maxBytes = computeMaxReclaimableBytes([groupSmall, groupMedium, groupTiny])
		assert.equal(maxBytes, 20 * mb)

		assert.deepEqual(computeListItemMetrics(groupMedium, maxBytes), {
			copyCount: 3,
			reclaimableBytes: 20 * mb,
			reclaimableFormatted: '20 MB',
			wastePercent: 100,
			hasProtectedOrigin: true,
		})

		assert.deepEqual(computeListItemMetrics(groupSmall, maxBytes), {
			copyCount: 2,
			reclaimableBytes: 2 * mb,
			reclaimableFormatted: '2 MB',
			wastePercent: 10,
			hasProtectedOrigin: false,
		})

		// Non-zero tiny waste clamps to at least 1% when max > 0
		const tinyMetrics = computeListItemMetrics(groupTiny, maxBytes)
		assert.equal(tinyMetrics.wastePercent, 1)
		assert.equal(tinyMetrics.copyCount, 2)

		// Zero max disables proportional bar
		assert.equal(computeListItemMetrics(groupSmall, 0).wastePercent, 0)
		assert.deepEqual(computeListItemMetrics(null, maxBytes), {
			copyCount: 0,
			reclaimableBytes: 0,
			reclaimableFormatted: '0 B',
			wastePercent: 0,
			hasProtectedOrigin: false,
		})
	})

	test('DuplicateListItem renders copy count, protected origin badge, proportional waste bar, and active state', async () => {
		const { DuplicateListItem } = createNavigationHarness()

		const mb = 1024 * 1024
		const protectedDup = {
			id: 10,
			hash: 'hash10',
			files: [
				{ id: 1, nodeId: 11, mimetype: 'video/mp4', size: 5 * mb, path: '/alice/files/Origin/clip.mp4', isInOriginFolder: true },
				{ id: 2, nodeId: 12, mimetype: 'video/mp4', size: 5 * mb, path: '/alice/files/Backup/clip.mp4', isInOriginFolder: false },
				{ id: 3, nodeId: 13, mimetype: 'video/mp4', size: 5 * mb, path: '/alice/files/Temp/clip.mp4', isInOriginFolder: false },
			],
		}

		const vm = new Vue({
			render(h) {
				return h(DuplicateListItem, {
					props: {
						duplicate: protectedDup,
						isActive: true,
						maxReclaimableBytes: 20 * mb,
					},
				})
			},
		}).$mount()
		await settle()

		assert.ok(vm.$el.classList.contains('is-active'))
		assert.ok(vm.$el.classList.contains('has-protected-origin'))
		assert.equal(vm.$el.querySelector('.duplicate-copy-count').textContent.trim(), '3x')
		assert.ok(vm.$el.querySelector('.duplicate-protected-badge'))
		const fill = vm.$el.querySelector('.duplicate-waste-fill')
		assert.ok(fill)
		assert.equal(fill.style.width, '50%')

		vm.$destroy()
	})

	test('DuplicateNavigation scales sidebar waste bars dynamically across filtered groups and updates section count badges', async () => {
		const { DuplicateNavigation } = createNavigationHarness()
		const mb = 1024 * 1024

		const unackLarge = {
			id: 1,
			hash: 'h1',
			acknowledged: false,
			files: [
				{ id: 1, nodeId: 1, mimetype: 'video/mp4', size: 10 * mb, path: '/alice/files/Videos/movie.mp4', isInOriginFolder: false },
				{ id: 2, nodeId: 2, mimetype: 'video/mp4', size: 10 * mb, path: '/alice/files/Backups/movie.mp4', isInOriginFolder: false },
				{ id: 3, nodeId: 3, mimetype: 'video/mp4', size: 10 * mb, path: '/alice/files/Archive/movie.mp4', isInOriginFolder: false },
			],
		} // 20 MB reclaimable, 3x

		const unackMedium = {
			id: 2,
			hash: 'h2',
			acknowledged: false,
			files: [
				{ id: 4, nodeId: 4, mimetype: 'image/jpeg', size: 5 * mb, path: '/alice/files/Photos/pic.jpg', isInOriginFolder: true },
				{ id: 5, nodeId: 5, mimetype: 'image/jpeg', size: 5 * mb, path: '/alice/files/Copies/pic.jpg', isInOriginFolder: false },
			],
		} // 5 MB reclaimable, 2x, protected

		const ackSmall = {
			id: 3,
			hash: 'h3',
			acknowledged: true,
			files: [
				{ id: 6, nodeId: 6, mimetype: 'image/jpeg', size: 2 * mb, path: '/alice/files/Photos/thumb.jpg', isInOriginFolder: false },
				{ id: 7, nodeId: 7, mimetype: 'image/jpeg', size: 2 * mb, path: '/alice/files/Copies/thumb.jpg', isInOriginFolder: false },
			],
		} // 2 MB reclaimable, 2x

		const wrapper = new Vue({
			render(h) {
				return h(DuplicateNavigation, {
					ref: 'nav',
					props: {
						acknowledgedDuplicates: [ackSmall],
						unacknowledgedDuplicates: [unackLarge, unackMedium],
						currentDuplicateId: 1,
						activeView: 'details',
					},
				})
			},
		}).$mount()
		await settle()

		const ackSectionBadge = wrapper.$el.querySelector('li[data-nav-name="Acknowledged"] .section-group-count')
		const unackSectionBadge = wrapper.$el.querySelector('li[data-nav-name="Unacknowledged"] .section-group-count')
		assert.equal(ackSectionBadge.textContent.trim(), '1')
		assert.equal(unackSectionBadge.textContent.trim(), '2')

		// Unfiltered: max is 20 MB (movie.mp4 = 100%, pic.jpg = 25%, thumb.jpg = 10%)
		const picRow = wrapper.$el.querySelector('li[data-nav-name="pic.jpg"]')
		assert.equal(picRow.querySelector('.duplicate-waste-fill').style.width, '25%')
		assert.equal(picRow.querySelector('.duplicate-copy-count').textContent.trim(), '2x')
		assert.ok(picRow.querySelector('.duplicate-protected-badge'))

		// Filter to Images only: movie.mp4 disappears, new max among visible groups is 5 MB (pic.jpg becomes 100%, thumb.jpg becomes 40%)
		wrapper.$refs.nav.setCategoryFilter('images')
		await settle()

		assert.equal(wrapper.$el.querySelector('li[data-nav-name="Unacknowledged"] .section-group-count').textContent.trim(), '1')
		assert.equal(wrapper.$el.querySelector('li[data-nav-name="Acknowledged"] .section-group-count').textContent.trim(), '1')
		assert.equal(wrapper.$el.querySelector('li[data-nav-name="pic.jpg"] .duplicate-waste-fill').style.width, '100%')
		assert.equal(wrapper.$el.querySelector('li[data-nav-name="thumb.jpg"] .duplicate-waste-fill').style.width, '40%')

		wrapper.$destroy()
	})

	test('Cycle 113 touched files preserve zero typographic dashes, zero XSS sinks, and logical CSS', () => {
		const files = [
			'src/tools/duplicateStats.js',
			'src/components/DuplicateListItem.vue',
			'src/components/DuplicateNavigation.vue',
			'tests/frontend/sidebar-visual-triage.test.cjs',
		]
		for (const file of files) {
			const content = readFileSync(resolve(root, file), 'utf8')
			assert.ok(!content.includes('\u2013') && !content.includes('\u2014'), `${file} must not contain U+2013/U+2014`)
			if (!file.startsWith('tests/')) {
				assert.ok(!/v-html\b|innerHTML\b|document\.write\b/.test(content), `${file} must not contain XSS sinks`)
			}
		}

		const listItemSource = readFileSync(resolve(root, 'src/components/DuplicateListItem.vue'), 'utf8')
		assert.ok(listItemSource.includes('focus-visible'), 'DuplicateListItem keeps :focus-visible styling')
		assert.ok(listItemSource.includes('margin-inline-start'), 'DuplicateListItem uses CSS logical properties')
	})
})
