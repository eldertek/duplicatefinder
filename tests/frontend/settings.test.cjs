const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { test } = require('node:test')
const { JSDOM } = require('jsdom')
const { transformSync } = require('@babel/core')


// Nextcloud components expect a browser and the host's translation helpers.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://cloud.example.test' })
global.window = dom.window
global.document = dom.window.document
global.HTMLElement = dom.window.HTMLElement
global.Element = dom.window.Element
global.Node = dom.window.Node
global.t = window.t = (app, text) => text
global.n = window.n = (app, one, many, count) => count === 1 ? one : many
window.OC = { config: {}, theme: {} }

// Styles do not affect the value contract under test.
require.extensions['.css'] = () => {}
const Vue = require('vue')
const { parseComponent, compileToFunctions } = require('vue-template-compiler')
Vue.config.productionTip = false
Vue.config.devtools = false
Vue.prototype.t = global.t
const components = Object.fromEntries(['NcButton', 'NcSettingsSection', 'NcCheckboxRadioSwitch', 'NcTextField']
	.map(name => [name, require(`@nextcloud/vue/dist/Components/${name}.js`)]))

function mountSettings() {
	let resolveRequest
	let rejectRequest
	const request = new Promise((resolve, reject) => {
		resolveRequest = resolve
		rejectRequest = reject
	})
	const errors = []
	const notices = []
	Vue.config.errorHandler = error => errors.push(error)
	const filename = resolve(__dirname, '../../src/Settings.vue')
	const source = parseComponent(readFileSync(filename, 'utf8'))
	const script = transformSync(source.script.content, {
		babelrc: false,
		configFile: false,
		plugins: ['@babel/plugin-transform-modules-commonjs'],
	}).code
	const imports = {
		'@nextcloud/vue': components,
		'@nextcloud/router': { generateUrl: path => path },
		'@nextcloud/axios': { get: () => request, post: () => Promise.resolve({}) },
		'@nextcloud/dialogs': { showError: message => notices.push(message), showSuccess: () => {} },
	}
	const module = { exports: {} }
	new Function('require', 'module', 'exports', script)(name => imports[name], module, module.exports)
	const options = { ...module.exports.default, ...compileToFunctions(source.template.content) }
	const vm = new Vue(options).$mount()
	return { vm, errors, notices, resolveRequest, rejectRequest }
}

const response = { data: { status: 'success', data: {
	backgroundjob_interval_cleanup: 172800,
	backgroundjob_interval_find: 432000,
	disable_filesystem_events: false,
	ignore_mounted_files: true,
	installed_version: '1.8.1',
} } }

test('settings render while the request is pending, then display the fetched intervals', async () => {
	const { vm, errors, resolveRequest } = mountSettings()
	try {
		assert.deepEqual(errors, [], 'Initial render must not fail before settings arrive')
		resolveRequest(response)
		await Promise.resolve()
		await Vue.nextTick()
		assert.deepEqual(errors, [], 'Fetched settings must render without errors')
		assert.deepEqual(Array.from(vm.$el.querySelectorAll('input[type="text"]'), input => input.value), ['172800', '432000'])
	} finally {
		vm.$destroy()
	}
})

test('a failed settings request reports the error without crashing the page', async () => {
	const { vm, errors, notices, rejectRequest } = mountSettings()
	const originalError = console.error
	console.error = () => {}
	try {
		rejectRequest(new Error('Synthetic request failure'))
		await Promise.resolve()
		await Vue.nextTick()
		assert.deepEqual(errors, [], 'Failed requests must leave the page renderable')
		assert.deepEqual(notices, ['Could not fetch settings'])
	} finally {
		console.error = originalError
		vm.$destroy()
	}
})
