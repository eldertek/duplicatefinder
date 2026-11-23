const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

const iconStub = {
	render(h) {
		return h('span')
	},
}

const ncButtonStub = {
	props: ['type', 'disabled'],
	render(h) {
		return h(
			'button',
			{
				attrs: { type: 'button', disabled: Boolean(this.disabled) },
				on: this.$listeners,
			},
			this.$slots.default,
		)
	},
}

const ncTextFieldStub = {
	props: ['value', 'label', 'placeholder', 'type'],
	render(h) {
		return h('input', {
			attrs: { type: this.type || 'text', placeholder: this.placeholder || '' },
			domProps: { value: this.value || '' },
			on: {
				input: event => this.$emit('update:value', event.target.value),
			},
		})
	},
}

describe('FAQ XSS hardening & ProjectDuplicates pagination', () => {
	test('faqParser safely tokenizes allowed markup and neutralizes XSS payloads and unsafe URIs', () => {
		const { parseFaqAnswer, extractFaqPlainText } = loadModule('src/tools/faqParser.js')

		const safeTokens = parseFaqAnswer('See <a href="https://github.com/eldertek/duplicatefinder/issues" target="_blank" rel="noopener noreferrer">GitHub Issues</a><br><strong>Tip:</strong> ok\nnext')
		assert.deepEqual(safeTokens, [
			{ type: 'text', text: 'See ' },
			{ type: 'link', href: 'https://github.com/eldertek/duplicatefinder/issues', text: 'GitHub Issues' },
			{ type: 'br' },
			{ type: 'strong', text: 'Tip:' },
			{ type: 'text', text: ' ok' },
			{ type: 'br' },
			{ type: 'text', text: 'next' },
		])

		const unsafeTokens = parseFaqAnswer('Click <a href="javascript:alert(1)">bad</a> and <img src=x onerror=alert(1)><script>evil()</script>')
		assert.equal(unsafeTokens.some(t => t.type === 'link'), false, 'javascript: links must be downgraded to plain text')
		assert.equal(extractFaqPlainText('Line 1<br><strong>Line 2</strong>'), 'Line 1 Line 2')
	})

	test('FAQ.vue renders links/formatting declaratively with accessible buttons and zero v-html/innerHTML sinks', async () => {
		const faqSource = readFileSync(resolve(root, 'src/components/help/FAQ.vue'), 'utf8')
		assert.equal(faqSource.includes('v-html'), false, 'FAQ.vue must not use v-html')
		assert.equal(faqSource.includes('innerHTML'), false, 'FAQ.vue must not use innerHTML')
		assert.equal(/[\u2013\u2014]/.test(faqSource), false, 'FAQ.vue must not contain U+2013/U+2014')

		const faqParser = loadModule('src/tools/faqParser.js')
		const FAQ = loadComponent('src/components/help/FAQ.vue', {
			'@nextcloud/vue': { NcTextField: ncTextFieldStub },
			'vue-material-design-icons/Magnify': iconStub,
			'vue-material-design-icons/ChevronDown': iconStub,
			'@/tools/faqParser': faqParser,
		})

		const vm = new Vue(FAQ).$mount()
		try {
			const questionButtons = vm.$el.querySelectorAll('button.question')
			assert.ok(questionButtons.length > 0, 'renders semantic button.question elements')
			assert.equal(questionButtons[0].getAttribute('aria-expanded'), 'false')

			questionButtons[0].click()
			await settle()
			assert.equal(questionButtons[0].getAttribute('aria-expanded'), 'true')

			const githubLink = vm.$el.querySelector('a[href="https://github.com/eldertek/duplicatefinder/issues"]')
			assert.ok(githubLink, 'renders safe HTTPS link declaratively')
			assert.equal(githubLink.getAttribute('rel'), 'noopener noreferrer')

			vm.updateSearch('GitHub')
			await settle()
			assert.equal(vm.filteredSections.length, 1, 'search matches FAQ items without innerHTML')
		} finally {
			vm.$destroy()
		}
	})

	test('ProjectDuplicates.vue replaces missing NcPagination with accessible pagination controls', async () => {
		const source = readFileSync(resolve(root, 'src/components/ProjectDuplicates.vue'), 'utf8')
		assert.equal(source.includes('NcPagination'), false, 'ProjectDuplicates.vue must not reference missing NcPagination')

		const requestedPages = []
		const ProjectDuplicates = loadComponent('src/components/ProjectDuplicates.vue', {
			'@nextcloud/vue': {
				NcButton: ncButtonStub,
				NcLoadingIcon: iconStub,
			},
			'vue-material-design-icons/Refresh': iconStub,
			'@/tools/api': {
				fetchProject: async id => ({ id, name: 'Photos', folders: ['/Photos'], lastScan: null }),
				fetchProjectDuplicates: async (_id, _type, page) => {
					requestedPages.push(page)
					return {
						entities: [
							{
								id: page,
								hash: `hash-${page}-abcdef`,
								files: [
									{ path: `/alice/files/Photos/img-${page}-a.jpg`, size: 1024, mimetype: 'image/jpeg' },
									{ path: `/alice/files/Photos/img-${page}-b.jpg`, size: 1024, mimetype: 'image/jpeg' },
								],
							},
						],
						pagination: { currentPage: page, totalPages: 3, totalItems: 25 },
					}
				},
				scanProject: async () => ({ status: 'ok' }),
			},
			'@nextcloud/dialogs': { showError: () => {}, showSuccess: () => {} },
		})

		const vm = new Vue({
			...ProjectDuplicates,
			propsData: { projectId: 7 },
		}).$mount()

		try {
			await settle()
			const nav = vm.$el.querySelector('nav.pagination')
			assert.ok(nav, 'renders semantic nav.pagination when totalPages > 1')
			const buttons = nav.querySelectorAll('button.pagination-button')
			assert.equal(buttons.length, 2)
			assert.equal(buttons[0].disabled, true, 'Previous is disabled on page 1')
			assert.equal(buttons[1].disabled, false, 'Next is enabled on page 1')
			assert.equal(nav.querySelector('.pagination-status').textContent.trim(), '1 / 3')

			buttons[1].click()
			await settle()
			assert.deepEqual(requestedPages, [1, 2])
			const updatedButtons = vm.$el.querySelectorAll('nav.pagination button.pagination-button')
			assert.equal(updatedButtons[0].disabled, false, 'Previous is enabled on page 2')
			assert.equal(vm.$el.querySelector('.pagination-status').textContent.trim(), '2 / 3')
		} finally {
			vm.$destroy()
		}
	})
})
