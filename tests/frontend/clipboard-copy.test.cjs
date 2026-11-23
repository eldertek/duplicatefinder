const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

function mountDisplay({ file, clipboardImpl } = {}) {
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')

	const Display = loadComponent('src/components/DuplicateFileDisplay.vue', {
		'@/tools/api': { deleteFile: async () => true },
		'@/tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: {
				copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl),
			},
		'@/tools/utils': utils,
		'@/tools/duplicatePathDiff': loadModule('src/tools/duplicatePathDiff.js'),
		'@nextcloud/router': { generateUrl: url => url },
	})

	const wrapper = new Vue({
		render(h) {
			return h(Display, {
				props: {
					file: file || {
						id: 10,
						nodeId: 42,
						path: '/alice/files/Photos/vacation.jpg',
						mimetype: 'image/jpeg',
						size: 2048,
						isInOriginFolder: false,
					},
					index: 0,
					duplicateAcknowledged: false,
					hasOtherFolders: true,
				},
			})
		},
	}).$mount()

	return wrapper
}

describe('Cycle 52: safe clipboard helper and 1-click Copy path button', () => {
	test('copyTextSafely writes non-empty text via writeText and returns true', async () => {
		const { copyTextSafely } = loadModule('src/tools/clipboardHelper.js')
		const written = []
		const mockClipboard = {
			writeText: async value => {
				written.push(value)
			},
		}

		const ok = await copyTextSafely('/Photos/vacation.jpg', mockClipboard)
		assert.equal(ok, true)
		assert.deepEqual(written, ['/Photos/vacation.jpg'])
	})

	test('copyTextSafely refuses empty, whitespace, and non-string inputs without calling writeText', async () => {
		const { copyTextSafely } = loadModule('src/tools/clipboardHelper.js')
		let calls = 0
		const mockClipboard = {
			writeText: async () => {
				calls++
			},
		}

		assert.equal(await copyTextSafely('', mockClipboard), false)
		assert.equal(await copyTextSafely('   ', mockClipboard), false)
		assert.equal(await copyTextSafely(null, mockClipboard), false)
		assert.equal(await copyTextSafely(undefined, mockClipboard), false)
		assert.equal(await copyTextSafely(123, mockClipboard), false)
		assert.equal(calls, 0)
	})

	test('copyTextSafely handles missing clipboard API and rejected/throwing writeText safely', async () => {
		const { copyTextSafely } = loadModule('src/tools/clipboardHelper.js')

		assert.equal(await copyTextSafely('/Photos/a.jpg', null), false)
		assert.equal(await copyTextSafely('/Photos/a.jpg', {}), false)
		assert.equal(
			await copyTextSafely('/Photos/a.jpg', {
				writeText: () => Promise.reject(new Error('NotAllowedError')),
			}),
			false,
		)
		assert.equal(
			await copyTextSafely('/Photos/a.jpg', {
				writeText: () => {
					throw new Error('SecurityError')
				},
			}),
			false,
		)

		const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
		try {
			const navCalls = []
			Object.defineProperty(globalThis, 'navigator', {
				configurable: true,
				value: {
					clipboard: {
						writeText: async value => {
							navCalls.push(value)
						},
					},
				},
			})
			assert.equal(await copyTextSafely('/Photos/nav.jpg'), true)
			assert.deepEqual(navCalls, ['/Photos/nav.jpg'])

			Object.defineProperty(globalThis, 'navigator', {
				configurable: true,
				value: undefined,
			})
			assert.equal(await copyTextSafely('/Photos/nav.jpg'), false)
		} finally {
			if (originalNavigatorDescriptor) {
				Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor)
			} else {
				delete globalThis.navigator
			}
		}
	})

	test('DuplicateFileDisplay Copy path button copies normalized path and announces Copied via aria-live polite', async () => {
		const copiedValues = []
		const wrapper = mountDisplay({
			clipboardImpl: {
				writeText: async value => {
					copiedValues.push(value)
				},
			},
		})
		await settle()

		const button = wrapper.$el.querySelector('button.copy-path-button')
		const status = wrapper.$el.querySelector('.copy-path-status')

		assert.ok(button, 'Copy path button is rendered as a semantic <button>')
		assert.equal(button.getAttribute('type'), 'button')
		assert.equal(button.getAttribute('aria-label'), 'Copy path')
		assert.ok(button.textContent.includes('Copy path'))
		assert.equal(button.disabled, false)

		assert.ok(status, 'live status element is rendered in DOM')
		assert.equal(status.getAttribute('aria-live'), 'polite')
		assert.equal(status.getAttribute('role'), 'status')
		assert.equal(status.textContent.trim(), '')

		button.click()
		await settle()

		assert.deepEqual(copiedValues, ['/Photos/vacation.jpg'])
		assert.equal(status.textContent.trim(), 'Copied')
		assert.equal(button.classList.contains('is-copied'), true)

		wrapper.$destroy()
	})

	test('DuplicateFileDisplay announces Copy failed cleanly on clipboard error and disables when path missing', async () => {
		const failingWrapper = mountDisplay({
			clipboardImpl: {
				writeText: async () => {
					throw new Error('Permission denied')
				},
			},
		})
		await settle()

		const button = failingWrapper.$el.querySelector('button.copy-path-button')
		const status = failingWrapper.$el.querySelector('.copy-path-status')
		button.click()
		await settle()

		assert.equal(status.textContent.trim(), 'Copy failed')
		assert.equal(button.classList.contains('is-error'), true)
		failingWrapper.$destroy()

		const emptyPathWrapper = mountDisplay({
			file: {
				id: 11,
				nodeId: 43,
				path: '',
				mimetype: 'text/plain',
				size: 0,
				isInOriginFolder: false,
			},
			clipboardImpl: {
				writeText: async () => {},
			},
		})
		await settle()

		const disabledButton = emptyPathWrapper.$el.querySelector('button.copy-path-button')
		assert.equal(disabledButton.disabled, true)
		emptyPathWrapper.$destroy()
	})

	test('clipboardHelper and DuplicateFileDisplay adhere to 44px logical CSS, focus-visible, zero XSS, and zero dashes', () => {
		const helperSource = readFileSync(resolve(root, 'src/tools/clipboardHelper.js'), 'utf8')
		const displaySource = readFileSync(resolve(root, 'src/components/DuplicateFileDisplay.vue'), 'utf8')

		for (const source of [helperSource, displaySource]) {
			assert.ok(!/[\u2013\u2014]/.test(source), 'must not contain U+2013 or U+2014 dashes')
			assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(source), 'must not contain DOM XSS sinks')
		}

		assert.ok(!displaySource.includes('position: absolute'), 'must not use position: absolute')
		assert.ok(displaySource.includes('.copy-path-button:focus-visible'), 'copy button styles :focus-visible')
		assert.ok(displaySource.includes('min-inline-size: 44px'), 'copy button enforces >= 44px inline target')
		assert.ok(displaySource.includes('min-block-size: 44px'), 'copy button enforces >= 44px block target')
	})
})
