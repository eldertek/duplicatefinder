// Shared set up of the frontend tests: a browser (jsdom), Vue 2, and a loader for single file components
// and ES modules of src/ whose imports are replaced by the stubs the test passes in.
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { JSDOM } = require('jsdom')
const { transformSync } = require('@babel/core')

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://cloud.example.test' })
global.window = dom.window
global.document = dom.window.document
global.HTMLElement = dom.window.HTMLElement
global.Element = dom.window.Element
global.Node = dom.window.Node
global.t = window.t = (app, text, vars = {}) => text.replace(/\{(\w+)\}/g, (_, key) => String(vars[key]))
global.n = window.n = (app, one, many, count) => count === 1 ? one : many
window.OC = {
	config: {},
	theme: {},
	Util: { humanFileSize: size => `${size} B` },
	MimeType: { getIconUrl: () => '' },
	generateUrl: path => path,
}
global.OC = window.OC

// The components log every step of a deletion
console.log = () => {}

const Vue = require('vue')
const { parseComponent, compileToFunctions } = require('vue-template-compiler')
Vue.config.productionTip = false
Vue.config.devtools = false
Vue.prototype.t = global.t

const root = resolve(__dirname, '../..')

function toCommonJs(code) {
	return transformSync(code, {
		babelrc: false,
		configFile: false,
		plugins: ['@babel/plugin-transform-modules-commonjs'],
	}).code
}

/**
 * Load a plain ES module of the project. Its imports are looked up in `imports`.
 */
function loadModule(relativePath, imports = {}) {
	const source = readFileSync(resolve(root, relativePath), 'utf8')
	const module = { exports: {} }
	new Function('require', 'module', 'exports', toCommonJs(source))(name => {
		if (!(name in imports)) {
			throw new Error(`Unexpected import "${name}" in ${relativePath}`)
		}
		return imports[name]
	}, module, module.exports)
	return module.exports
}

/**
 * Load a single file component of the project as Vue component options, imports replaced by `imports`.
 */
function loadComponent(relativePath, imports = {}) {
	const source = parseComponent(readFileSync(resolve(root, relativePath), 'utf8'))
	const module = { exports: {} }
	new Function('require', 'module', 'exports', toCommonJs(source.script.content))(name => {
		if (!(name in imports)) {
			throw new Error(`Unexpected import "${name}" in ${relativePath}`)
		}
		return imports[name]
	}, module, module.exports)
	return { ...module.exports.default, ...compileToFunctions(source.template.content) }
}

/** Let the pending promises and the next render happen. */
async function settle() {
	for (let i = 0; i < 5; i++) {
		await Promise.resolve()
	}
	await Vue.nextTick()
	await new Promise(done => setTimeout(done, 0))
	await Vue.nextTick()
}

module.exports = { Vue, loadComponent, loadModule, settle, window, document }
