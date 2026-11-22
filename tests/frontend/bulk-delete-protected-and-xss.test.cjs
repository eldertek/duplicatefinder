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

function buildBulkComponent({ entities, deleteCalls }) {
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})

	return loadComponent('src/components/BulkDeletionSettings.vue', {
		'@nextcloud/vue': {
			NcButton: {
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
			},
			NcCheckboxRadioSwitch: {
				props: ['checked'],
				render(h) {
					return h(
						'label',
						{
							on: {
								click: () => this.$emit('update:checked', !this.checked),
							},
						},
						this.$slots.default,
					)
				},
			},
			NcEmptyContent: {
				render(h) {
					return h('div', [
						this.$slots.default,
						this.$scopedSlots.action ? this.$scopedSlots.action() : null,
					])
				},
			},
			NcLoadingIcon: slotBox('span'),
			NcActions: slotBox('div'),
			NcActionButton: slotBox('button'),
		},
		'@/tools/api': {
			fetchDuplicatesForBulk: async () => ({
				entities,
				pagination: { currentPage: 1, totalPages: 1, totalItems: entities.length, limit: 100 },
			}),
			deleteFiles: async files => {
				deleteCalls.push(files)
				return { success: files, errors: [] }
			},
		},
		'@/tools/utils': utils,
		'vue-material-design-icons/ChevronDown.vue': slotBox('span'),
		'@nextcloud/l10n': { translate: global.t },
	})
}

describe('BulkDeletionSettings: protectedFileCount propagation, XSS-safe path rendering, and responsive/a11y guards', () => {
	test('preserves protectedFileCount and deletes non-protected copies when origin copies exist', async () => {
		const deleteCalls = []
		const BulkDeletionSettings = buildBulkComponent({
			deleteCalls,
			entities: [
				{
					hash: 'hash-mixed',
					protectedFileCount: 1,
					hasOnlyProtectedFiles: false,
					files: [
						{ path: '/alice/files/Downloads/dup.jpg', size: 2048, nodeId: 42, mimetype: 'image/jpeg' },
					],
				},
				{
					hash: 'hash-protected-only',
					protectedFileCount: 2,
					hasOnlyProtectedFiles: true,
					files: [],
				},
			],
		})

		const vm = new Vue(BulkDeletionSettings).$mount()
		await vm.performDryRun()
		await settle()

		const text = vm.$el.textContent
		assert.ok(text.includes('1 protected files in origin folders'), 'displays protected file count on mixed group')
		assert.ok(text.includes('All 2 files are in origin folders and cannot be deleted'), 'displays exact protected count instead of undefined')
		assert.equal(vm.hasProtectedFiles, true)
		assert.equal(vm.isAllSelected, false)

		const previewButtons = vm.$el.querySelectorAll('.preview-button')
		assert.equal(previewButtons.length, 1, 'hides Preview button for all-protected group with no deletable files')

		vm.toggleFile('hash-mixed', 0)
		await settle()
		assert.equal(vm.isAllSelected, true, 'isAllSelected ignores empty all-protected groups')

		const deletePromise = vm.confirmBulkDelete()
		await settle()
		vm.$el.querySelector('.nc-confirm-dialog__button--danger').click()
		await deletePromise
		await settle()

		assert.equal(deleteCalls.length, 1)
		assert.deepEqual(
			deleteCalls[0].map(f => ({ path: f.path, nodeId: f.nodeId, fileHash: f.fileHash })),
			[{ path: '/alice/files/Downloads/dup.jpg', nodeId: 42, fileHash: 'hash-mixed' }],
		)

		vm.$destroy()
	})

	test('renders malicious filenames safely as plain text without HTML injection', async () => {
		const deleteCalls = []
		const xssPath = '/alice/files/<img src=x onerror=alert(1)>/<script>evil()</script>.png'
		const BulkDeletionSettings = buildBulkComponent({
			deleteCalls,
			entities: [
				{
					hash: 'hash-xss',
					protectedFileCount: 0,
					hasOnlyProtectedFiles: false,
					files: [
						{ path: xssPath, size: 512, nodeId: 99, mimetype: 'image/png' },
					],
				},
			],
		})

		const vm = new Vue(BulkDeletionSettings).$mount()
		await vm.performDryRun()
		await settle()

		const label = vm.$el.querySelector('.file-path-label')
		assert.ok(label, 'renders file path label')
		assert.equal(label.querySelectorAll('img, script').length, 0, 'must not inject HTML elements from file paths')
		assert.ok(label.textContent.includes('<img src=x onerror=alert(1)>'), 'renders raw angle brackets safely as text')
		assert.ok(label.textContent.includes('<script>evil()</script>.png'), 'renders script tag safely as text')

		vm.$destroy()
	})

	test('BulkDeletionSettings source has no v-html, no typographic dashes, wraps summary actions, and preserves focus-visible outlines', () => {
		const vueSource = readFileSync(resolve(root, 'src/components/BulkDeletionSettings.vue'), 'utf8')
		assert.equal(vueSource.includes('v-html'), false, 'BulkDeletionSettings.vue must not use v-html')
		assert.equal(/[\u2013\u2014]/.test(vueSource), false, 'BulkDeletionSettings.vue must not contain U+2013/U+2014')
		assert.match(vueSource, /\.summary-actions\s*\{[^}]*flex-wrap:\s*wrap/s)
		assert.match(vueSource, /\.empty-folder-checkbox:focus-visible\s*\{[^}]*outline:\s*2px solid/s)
		assert.match(vueSource, /\.empty-folder-ignore-button:focus-visible\s*\{[^}]*outline:\s*2px solid/s)
	})
})
