const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, settle } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

function readComponent(relativePath) {
	return readFileSync(resolve(root, relativePath), 'utf8')
}

function sliceCssBlock(source, selector, useLast = false) {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	const matches = Array.from(source.matchAll(new RegExp(`(?:^|\\r?\\n)[ \\t]*${escaped}`, 'g')))
	assert.ok(matches.length > 0, `Expected selector "${selector}" to exist`)
	const match = useLast ? matches[matches.length - 1] : matches[0]
	const start = match.index
	const end = source.indexOf('}', start)
	assert.notEqual(end, -1, `Expected closing brace for "${selector}"`)
	return source.slice(start, end + 1)
}

describe('Issue #251: Comprehensive vertical and horizontal centering polish', () => {
	test('DuplicateNavigation centers Confirmed/Not confirmed section headers via :deep() flex rules', () => {
		const nav = readComponent('src/components/DuplicateNavigation.vue')

		for (const selector of [
			'.duplicate-section-nav :deep(.app-navigation-entry) {',
			'.duplicate-section-nav :deep(.app-navigation-entry-link) {',
			'.duplicate-section-nav :deep(.app-navigation-entry-icon) {',
			'.duplicate-section-nav :deep(.app-navigation-entry__name) {',
			'.duplicate-section-nav :deep(.button-vue.icon-collapse) {',
		]) {
			assert.ok(nav.includes(selector), `Missing section nav rule: ${selector}`)
		}

		const entryBlock = sliceCssBlock(nav, '.duplicate-section-nav :deep(.app-navigation-entry) {')
		assert.ok(entryBlock.includes('display: flex;'))
		assert.ok(entryBlock.includes('align-items: center;'))

		const linkBlock = sliceCssBlock(nav, '.duplicate-section-nav :deep(.app-navigation-entry-link) {')
		assert.ok(linkBlock.includes('display: flex;'))
		assert.ok(linkBlock.includes('align-items: center;'))
		assert.ok(linkBlock.includes('line-height: 1.25;'))

		const nameBlock = sliceCssBlock(nav, '.duplicate-section-nav :deep(.app-navigation-entry__name) {')
		assert.ok(nameBlock.includes('line-height: 1.25;'))

		const collapseBlock = sliceCssBlock(nav, '.duplicate-section-nav :deep(.button-vue.icon-collapse) {')
		assert.ok(collapseBlock.includes('display: inline-flex;'))
		assert.ok(collapseBlock.includes('align-items: center;'))
		assert.ok(collapseBlock.includes('justify-content: center;'))
		assert.ok(collapseBlock.includes('align-self: center;'))
	})

	test('Sort, category-more, and search-type menu options use balanced vertical padding and tight line-height', () => {
		const nav = readComponent('src/components/DuplicateNavigation.vue')
		const sortBlock = sliceCssBlock(nav, '.sort-option {')
		assert.ok(sortBlock.includes('display: flex !important;'))
		assert.ok(sortBlock.includes('align-items: center !important;'))
		assert.ok(sortBlock.includes('justify-content: flex-start !important;'))
		assert.ok(sortBlock.includes('padding-block: 4px !important;'))
		assert.ok(sortBlock.includes('line-height: 1.15 !important;'))

		const moreBlock = sliceCssBlock(nav, '.category-more-option {')
		assert.ok(moreBlock.includes('display: flex !important;'))
		assert.ok(moreBlock.includes('align-items: center !important;'))
		assert.ok(moreBlock.includes('padding-block: 4px !important;'))
		assert.ok(moreBlock.includes('line-height: 1.15 !important;'))

		const searchBar = readComponent('src/components/SearchBar.vue')
		const searchOptBlock = sliceCssBlock(searchBar, '.search-type-option {')
		assert.ok(searchOptBlock.includes('display: flex !important;'))
		assert.ok(searchOptBlock.includes('align-items: center !important;'))
		assert.ok(searchOptBlock.includes('justify-content: flex-start !important;'))
		assert.ok(searchOptBlock.includes('padding: 4px 14px !important;'))
		assert.ok(searchOptBlock.includes('line-height: 1.15 !important;'))
	})

	test('Projects/Help menu items and reclaimable summary badge align icons and text cleanly', () => {
		const nav = readComponent('src/components/DuplicateNavigation.vue')

		const menuItemBlock = sliceCssBlock(nav, '.menu-item {')
		assert.ok(menuItemBlock.includes('display: flex !important;'))
		assert.ok(menuItemBlock.includes('align-items: center;'))
		assert.ok(menuItemBlock.includes('line-height: 1.25;'))

		const helpMenuBlock = sliceCssBlock(nav, '.help-menu .menu-item {')
		assert.ok(helpMenuBlock.includes('display: grid !important;'))
		assert.ok(helpMenuBlock.includes('grid-template-columns: 16px minmax(0, 1fr);'))
		assert.ok(helpMenuBlock.includes('align-items: center;'))

		const summaryBadge = sliceCssBlock(nav, '.reclaimable-summary-badge {')
		assert.ok(summaryBadge.includes('align-items: center;'))
		assert.ok(!summaryBadge.includes('align-items: baseline;'))
	})

	test('DuplicateListItem centers navigation entry, file-size extra slot, and nav-thumbnail', () => {
		const item = readComponent('src/components/DuplicateListItem.vue')

		const entryBlock = sliceCssBlock(item, ':deep(.app-navigation-entry) {')
		assert.ok(entryBlock.includes('display: flex;'))
		assert.ok(entryBlock.includes('align-items: center;'))

		const linkBlock = sliceCssBlock(item, ':deep(.app-navigation-entry-link) {')
		assert.ok(linkBlock.includes('display: flex;'))
		assert.ok(linkBlock.includes('align-items: center;'))
		assert.ok(linkBlock.includes('line-height: 1.25;'))

		const nameBlock = sliceCssBlock(item, ':deep(.app-navigation-entry__name) {')
		assert.ok(nameBlock.includes('line-height: 1.25;'))

		const thumbBlock = sliceCssBlock(item, '.nav-thumbnail {')
		assert.ok(thumbBlock.includes('margin: 0;'))
		assert.ok(!thumbBlock.includes('margin-inline-end: 8px;'))

		const sizeBlock = sliceCssBlock(item, '.file-size {')
		assert.ok(sizeBlock.includes('display: inline-flex;'))
		assert.ok(sizeBlock.includes('align-items: center;'))
		assert.ok(sizeBlock.includes('justify-content: flex-end;'))
		assert.ok(sizeBlock.includes('align-self: center;'))
		assert.ok(sizeBlock.includes('line-height: 1.2;'))
		assert.ok(sizeBlock.includes('padding-inline-end: 8px;'))
	})

	test('DuplicateDetails and DuplicateFileDisplay center pills, badges, table headers, toolbar buttons, and dropdown actions', () => {
		const details = readComponent('src/components/DuplicateDetails.vue')

		const pillBlock = sliceCssBlock(details, '.group-status-pill {')
		assert.ok(pillBlock.includes('justify-content: center;'))
		assert.ok(pillBlock.includes('line-height: 1.2;'))
		assert.ok(pillBlock.includes('text-align: center;'))

		const toolbarBlock = sliceCssBlock(details, '.toolbar-button {')
		assert.ok(toolbarBlock.includes('line-height: 1.15 !important;'))

		const toolbarSpanBlock = sliceCssBlock(details, '.toolbar-button span {', true)
		assert.ok(toolbarSpanBlock.includes('display: inline-flex;'))
		assert.ok(toolbarSpanBlock.includes('align-items: center;'))

		for (const colSelector of ['.col-preview {', '.col-name {', '.col-size {', '.col-status {', '.col-actions {']) {
			const colBlock = sliceCssBlock(details, colSelector)
			assert.ok(colBlock.includes('display: flex;'), `${colSelector} should be flex`)
			assert.ok(colBlock.includes('align-items: center;'), `${colSelector} should center vertically`)
		}

		const dropdownBtnBlock = sliceCssBlock(details, '.dropdown-menu button {')
		assert.ok(dropdownBtnBlock.includes('display: flex;'))
		assert.ok(dropdownBtnBlock.includes('align-items: center;'))
		assert.ok(dropdownBtnBlock.includes('justify-content: flex-start;'))
		assert.ok(dropdownBtnBlock.includes('min-height: 44px;'))
		assert.ok(dropdownBtnBlock.includes('line-height: 1.2;'))

		const fileDisplay = readComponent('src/components/DuplicateFileDisplay.vue')
		const fileNameBadgeBlock = sliceCssBlock(fileDisplay, '.file-name-badge {')
		assert.ok(fileNameBadgeBlock.includes('display: inline-flex;'))
		assert.ok(fileNameBadgeBlock.includes('align-items: center;'))
		assert.ok(fileNameBadgeBlock.includes('justify-content: center;'))
		assert.ok(fileNameBadgeBlock.includes('line-height: 1.2;'))

		const metadataBadgeBlock = sliceCssBlock(fileDisplay, '.metadata-badge {')
		assert.ok(metadataBadgeBlock.includes('line-height: 1.2;'))

		const metadataTextBlock = sliceCssBlock(fileDisplay, '.metadata-badge__text {')
		assert.ok(metadataTextBlock.includes('line-height: 1.2;'))

		const statusBadgeBlock = sliceCssBlock(fileDisplay, '.file-status-badge {')
		assert.ok(statusBadgeBlock.includes('justify-content: center;'))
		assert.ok(statusBadgeBlock.includes('line-height: 1.2;'))
	})

	test('Settings headers protect SVG icons from shrinking and badges/long paths wrap cleanly', () => {
		for (const file of [
			'src/components/FilterSettings.vue',
			'src/components/OriginFoldersSettings.vue',
			'src/components/ExcludedFoldersSettings.vue',
			'src/components/ProjectsSettings.vue',
		]) {
			const src = readComponent(file)
			const svgBlock = sliceCssBlock(src, '.header :deep(svg) {')
			assert.ok(svgBlock.includes('flex-shrink: 0;'), `${file} missing flex-shrink: 0 on .header :deep(svg)`)
		}

		const filterSettings = readComponent('src/components/FilterSettings.vue')
		const filterTypeBlock = sliceCssBlock(filterSettings, '.filter-type {')
		assert.ok(filterTypeBlock.includes('display: inline-flex;'))
		assert.ok(filterTypeBlock.includes('align-items: center;'))
		assert.ok(filterTypeBlock.includes('gap: 4px;'))
		assert.ok(filterTypeBlock.includes('line-height: 1.2;'))

		const projectsSettings = readComponent('src/components/ProjectsSettings.vue')
		const selectedFolderSpan = sliceCssBlock(projectsSettings, '.selected-folder span {')
		assert.ok(selectedFolderSpan.includes('min-width: 0;'))
		assert.ok(selectedFolderSpan.includes('overflow-wrap: anywhere;'))
	})

	test('DuplicateListItem and SearchBar mount cleanly and render expected DOM slots', async () => {
		const NcAppNavigationItemStub = {
			props: ['name', 'title'],
			render(h) {
				return h('li', { class: 'app-navigation-entry-wrapper' }, [
					h('div', { class: 'app-navigation-entry' }, [
						h('a', { class: 'app-navigation-entry-link' }, [
							h('div', { class: 'app-navigation-entry-icon' }, this.$slots.icon),
							h('span', { class: 'app-navigation-entry__name' }, this.name),
						]),
						this.$slots.extra,
					]),
				])
			},
		}

		const ListItemComp = loadComponent('src/components/DuplicateListItem.vue', {
			'@nextcloud/vue': { NcAppNavigationItem: NcAppNavigationItemStub },
			'@/tools/utils': {
				getFormattedSizeOfCurrentDuplicate: () => '48 B',
				normalizeItemPath: p => p,
			},
		})
		const itemVm = new Vue({
			...ListItemComp,
			propsData: {
				isActive: true,
				duplicate: {
					id: 1,
					hash: 'abcdef123456',
					files: [
						{ path: '/user/files/sample.txt', mimetype: 'text/plain', nodeId: 10, size: 24 },
						{ path: '/user/files/copy/sample.txt', mimetype: 'text/plain', nodeId: 11, size: 24 },
					],
				},
			},
		}).$mount()
		await settle()
		assert.equal(itemVm.$el.querySelector('.nav-thumbnail') !== null, true)
		assert.equal(itemVm.$el.querySelector('.file-size').textContent.trim(), '48 B')
		itemVm.$destroy()

		const SearchBarComp = loadComponent('src/components/SearchBar.vue', {
			'vue-material-design-icons/ChevronDown': { render: h => h('svg') },
		})
		const searchVm = new Vue(SearchBarComp).$mount()
		searchVm.showTypeSelector = true
		await settle()
		const activeOpt = searchVm.$el.querySelector('.search-type-option.active')
		assert.ok(activeOpt)
		assert.equal(activeOpt.getAttribute('aria-selected'), 'true')
		searchVm.$destroy()
	})

	test('Modified components contain zero U+2013/U+2014 dashes and zero raw DOM XSS sinks', () => {
		const files = [
			'src/components/DuplicateNavigation.vue',
			'src/components/DuplicateListItem.vue',
			'src/components/SearchBar.vue',
			'src/components/DuplicateDetails.vue',
			'src/components/DuplicateFileDisplay.vue',
			'src/components/FilterSettings.vue',
			'src/components/OriginFoldersSettings.vue',
			'src/components/ExcludedFoldersSettings.vue',
			'src/components/ProjectsSettings.vue',
			'tests/frontend/ui-polish-issue251.test.cjs',
		]

		for (const file of files) {
			const content = readComponent(file)
			assert.equal(/[\u2013\u2014]/.test(content), false, `Disallowed en/em dash found in ${file}`)
			if (file.endsWith('.vue')) {
				assert.equal(/\bv-html\b/.test(content), false, `Disallowed v-html sink in ${file}`)
				assert.equal(/\.innerHTML\b|\.outerHTML\b|document\.write\b|insertAdjacentHTML\b/.test(content), false, `Disallowed DOM XSS sink in ${file}`)
			}
		}
	})
})
