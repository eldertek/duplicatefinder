const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')

const root = resolve(__dirname, '../..')

describe('Issue #250: UI visual polish (centered mode buttons, no menu horizontal scroll, seamless active fills, consistent typography)', () => {
	test('DuplicateNavigation enforces centered Normal/Advanced/Expert buttons without Nextcloud core margin/border bleed', () => {
		const nav = readFileSync(resolve(root, 'src/components/DuplicateNavigation.vue'), 'utf8')
		const switcherStart = nav.indexOf('.ui-level-option {')
		const switcherEnd = nav.indexOf('.sort-option {')
		const block = nav.slice(switcherStart, switcherEnd)

		assert.ok(block.includes('display: inline-flex !important;'))
		assert.ok(block.includes('align-items: center !important;'))
		assert.ok(block.includes('justify-content: center !important;'))
		assert.ok(block.includes('margin-block: 0 !important;'))
		assert.ok(block.includes('margin-inline: 0 !important;'))
		assert.ok(block.includes('padding-block: 0 !important;'))
		assert.ok(block.includes('text-align: center !important;'))
		assert.ok(block.includes('box-shadow: none !important;'))
		assert.ok(block.includes('background-image: none !important;'))
		assert.ok(block.includes('border: 1px solid var(--color-primary-element, #0082c9) !important;'))
	})

	test('Sort & Filter dropdown prevents horizontal scrollbar with overflow-x hidden, sufficient width, and zero-margin options', () => {
		const nav = readFileSync(resolve(root, 'src/components/DuplicateNavigation.vue'), 'utf8')
		const menuStart = nav.indexOf('.sort-menu {')
		const menuEnd = nav.indexOf('.sort-menu-section-title {')
		const menuBlock = nav.slice(menuStart, menuEnd)

		assert.ok(menuBlock.includes('overflow-x: hidden !important;'))
		assert.ok(menuBlock.includes('overflow-y: auto;'))
		assert.ok(menuBlock.includes('inline-size: min(268px, calc(100vw - 24px));'))
		assert.ok(menuBlock.includes('max-inline-size: min(268px, calc(100vw - 24px));'))

		const optStart = nav.indexOf('.sort-option {')
		const optEnd = nav.indexOf('.custom-size-row {')
		const optBlock = nav.slice(optStart, optEnd)
		assert.ok(optBlock.includes('margin-block: 0 !important;'))
		assert.ok(optBlock.includes('margin-inline: 0 !important;'))
		assert.ok(optBlock.includes('inline-size: 100% !important;'))
		assert.ok(optBlock.includes('border: none !important;'))
	})

	test('Category segmented bar fills active segments flush with zero dark gap and zero white right border', () => {
		const nav = readFileSync(resolve(root, 'src/components/DuplicateNavigation.vue'), 'utf8')
		const segStart = nav.indexOf('.category-segmented-bar {')
		const segEnd = nav.indexOf('.category-more-chevron {')
		const segBlock = nav.slice(segStart, segEnd)

		assert.ok(segBlock.includes('overflow: hidden;'))
		assert.ok(segBlock.includes('margin-block: 0 !important;'))
		assert.ok(segBlock.includes('margin-inline: 0 !important;'))
		assert.ok(segBlock.includes('background-image: none !important;'))
		assert.ok(segBlock.includes('box-shadow: none !important;'))
		assert.ok(segBlock.includes('border-inline-end-color: var(--color-primary-element, #0082c9) !important;'))
	})

	test('App.vue defines unified typography tokens inherited across buttons, inputs, selects, and textareas', () => {
		const app = readFileSync(resolve(root, 'src/App.vue'), 'utf8')
		for (const token of [
			'--df-font-family:',
			'--df-font-size-xs:',
			'--df-font-size-sm:',
			'--df-font-size-base:',
			'--df-font-size-md:',
			'--df-font-size-lg:',
			'#content.app-duplicatefinder button',
			'#content.app-duplicatefinder input',
			'#content.app-duplicatefinder select',
		]) {
			assert.ok(app.includes(token), `Missing typography token or rule: ${token}`)
		}
	})
})
