const { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { execFileSync } = require('node:child_process')
const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { Vue, loadComponent, loadModule, settle } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

function resolvePythonBin() {
	for (const candidate of ['python3', 'python']) {
		try {
			execFileSync(candidate, ['--version'], { stdio: 'ignore' })
			return candidate
		} catch (_) {
			// try next binary
		}
	}
	throw new Error('Python interpreter is required to run merge_l10n_fallback.py tests')
}

describe('Bulk deletion disabled button contrast & l10n-fallback packaging safeguard', () => {
	test('BulkDeletionSettings marks Delete selected files button with contrast class and disables it when 0 files selected', async () => {
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const NcButtonStub = {
			name: 'NcButtonStub',
			props: ['type', 'disabled'],
			render(h) {
				return h(
					'button',
					{
						attrs: {
							type: 'button',
							disabled: this.disabled,
							'data-nc-type': this.type || 'secondary',
						},
						on: this.$listeners,
					},
					this.$slots.default
				)
			},
		}
		const slotBox = tag => ({
			render(h) {
				return h(tag, { on: this.$listeners }, this.$slots.default)
			},
		})
		const BulkDeletionSettings = loadComponent('src/components/BulkDeletionSettings.vue', {
			'@nextcloud/vue': {
				NcButton: NcButtonStub,
				NcCheckboxRadioSwitch: slotBox('label'),
				NcEmptyContent: {
					props: ['title', 'description', 'icon'],
					render(h) {
						return h('div', [this.$scopedSlots.action ? this.$scopedSlots.action() : null])
					},
				},
				NcLoadingIcon: slotBox('span'),
				NcActions: slotBox('div'),
				NcActionButton: slotBox('button'),
			},
			'@/tools/api': {
				fetchDuplicatesForBulk: async () => ({
					entities: [
						{
							hash: 'abc12345',
							files: [
								{ path: '/qa-bot/files/Photos/img1.png', size: 4096, nodeId: 11, mimetype: 'image/png' },
								{ path: '/qa-bot/files/Backup/img1.png', size: 4096, nodeId: 12, mimetype: 'image/png' },
							],
						},
					],
					pagination: { currentPage: 1, totalPages: 1, totalItems: 1 },
				}),
				deleteFiles: async () => ({ success: [], errors: [] }),
			},
			'@/tools/utils': utils,
			'@nextcloud/l10n': { translate: (_app, text) => text },
			'vue-material-design-icons/ChevronDown.vue': slotBox('span'),
		})

		const vm = new Vue(BulkDeletionSettings).$mount()
		await vm.performDryRun()
		await settle()

		const deleteBtn = vm.$el.querySelector('.delete-selected-files-button')
		assert.ok(deleteBtn, 'Delete selected files button carries .delete-selected-files-button class')
		assert.equal(deleteBtn.disabled, true, 'Delete selected files button is disabled when 0 files are selected')

		vm.toggleFile('abc12345', 0)
		await settle()
		assert.equal(deleteBtn.disabled, false, 'Delete selected files button enables once a file is selected')

		const source = readFileSync(resolve(root, 'src/components/BulkDeletionSettings.vue'), 'utf8')
		assert.match(source, /\.delete-selected-files-button:disabled\s*,[\s\S]*?color:\s*var\(--color-text-maxcontrast/)

		vm.$destroy()
	})

	test('merge_l10n_fallback.py fills only missing/empty keys and NEVER overwrites existing Transifex translations', () => {
		const pythonBin = resolvePythonBin()
		const scriptPath = resolve(root, 'scripts/merge_l10n_fallback.py')
		assert.equal(existsSync(scriptPath), true, 'scripts/merge_l10n_fallback.py must exist')

		const tempRoot = mkdtempSync(join(tmpdir(), 'dupfinder-l10n-test-'))
		try {
			const targetDir = join(tempRoot, 'l10n')
			const fallbackDir = join(tempRoot, 'l10n-fallback')
			const { mkdirSync } = require('node:fs')
			mkdirSync(targetDir, { recursive: true })
			mkdirSync(fallbackDir, { recursive: true })

			writeFileSync(
				join(targetDir, 'it.json'),
				JSON.stringify({
					translations: {
						Duplicates: 'Duplicati (Transifex Human)',
						'Empty Key': '   ',
					},
					pluralForm: 'nplurals=3; plural=n == 1 ? 0 : n != 0 && n % 1000000 == 0 ? 1 : 2;',
				}),
				'utf8'
			)
			writeFileSync(
				join(targetDir, 'it.js'),
				'OC.L10N.register("duplicatefinder", {"Duplicates":"Duplicati (Transifex Human)"}, "nplurals=3; plural=n == 1 ? 0 : n != 0 && n % 1000000 == 0 ? 1 : 2;");\n',
				'utf8'
			)

			writeFileSync(
				join(fallbackDir, 'it.json'),
				JSON.stringify({
					pluralForm: 'nplurals=2; plural=(n != 1);',
					translations: {
						Duplicates: 'DO NOT OVERWRITE THIS',
						'Empty Key': 'Chiave riempita dal fallback',
						'Bulk Delete': 'Eliminazione multipla',
					},
				}),
				'utf8'
			)

			execFileSync(pythonBin, [
				scriptPath,
				'--target-dir',
				targetDir,
				'--fallback-dir',
				fallbackDir,
			])

			const mergedJson = JSON.parse(readFileSync(join(targetDir, 'it.json'), 'utf8'))
			assert.equal(
				mergedJson.translations.Duplicates,
				'Duplicati (Transifex Human)',
				'Existing Transifex translation must NEVER be overwritten'
			)
			assert.equal(
				mergedJson.translations['Empty Key'],
				'Chiave riempita dal fallback',
				'Blank/whitespace translation key must be populated from fallback'
			)
			assert.equal(
				mergedJson.translations['Bulk Delete'],
				'Eliminazione multipla',
				'Missing translation key must be populated from fallback'
			)
			assert.equal(
				mergedJson.pluralForm,
				'nplurals=3; plural=n == 1 ? 0 : n != 0 && n % 1000000 == 0 ? 1 : 2;',
				'Existing Transifex pluralForm must NEVER be overwritten'
			)

			const mergedJs = readFileSync(join(targetDir, 'it.js'), 'utf8')
			let registeredApp = null
			let registeredTranslations = null
			let registeredPlural = null
			const sandboxOC = {
				L10N: {
					register(app, translations, plural) {
						registeredApp = app
						registeredTranslations = translations
						registeredPlural = plural
					},
				},
			}
			const runner = new Function('OC', mergedJs)
			runner(sandboxOC)

			assert.equal(registeredApp, 'duplicatefinder')
			assert.equal(registeredTranslations.Duplicates, 'Duplicati (Transifex Human)')
			assert.equal(registeredTranslations['Bulk Delete'], 'Eliminazione multipla')
			assert.equal(registeredPlural, 'nplurals=3; plural=n == 1 ? 0 : n != 0 && n % 1000000 == 0 ? 1 : 2;')
		} finally {
			rmSync(tempRoot, { recursive: true, force: true })
		}
	})

	test('repository l10n-fallback files cover major locales cleanly with matching placeholders', () => {
		const fallbackLocales = ['it', 'nl', 'ja', 'ko', 'zh_CN', 'pl', 'ar', 'es', 'pt_PT']
		const placeholderRegex = /\{[a-zA-Z0-9_]+\}/g

		for (const locale of fallbackLocales) {
			const fallbackPath = resolve(root, `l10n-fallback/${locale}.json`)
			assert.equal(existsSync(fallbackPath), true, `l10n-fallback/${locale}.json must exist`)
			const raw = readFileSync(fallbackPath, 'utf8')
			assert.equal(raw.includes('\u2013'), false, `${locale}.json must not contain en-dash`)
			assert.equal(raw.includes('\u2014'), false, `${locale}.json must not contain em-dash`)

			const parsed = JSON.parse(raw)
			assert.equal(typeof parsed.translations, 'object')
			const entries = Object.entries(parsed.translations)
			assert.ok(entries.length >= 70, `${locale}.json should populate major missing UI keys (found ${entries.length})`)

			for (const [enKey, translated] of entries) {
				assert.equal(typeof translated, 'string')
				assert.ok(translated.trim().length > 0, `Empty translation in ${locale}.json for "${enKey}"`)
				const expectedPlaceholders = (enKey.match(placeholderRegex) || []).sort()
				const actualPlaceholders = (translated.match(placeholderRegex) || []).sort()
				assert.deepEqual(
					actualPlaceholders,
					expectedPlaceholders,
					`Placeholder mismatch in ${locale}.json for key "${enKey}": expected ${expectedPlaceholders}, got ${actualPlaceholders}`
				)
			}
		}
	})
})
