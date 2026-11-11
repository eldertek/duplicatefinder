const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { test } = require('node:test')
const { Vue, loadComponent, settle } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

const StubIcon = {
	props: ['size'],
	render(h) {
		return h('span', { class: 'icon-stub' })
	},
}

const NcButtonStub = {
	props: ['type', 'disabled'],
	render(h) {
		return h('button', {
			attrs: { type: 'button', disabled: this.disabled },
			on: { click: event => this.$emit('click', event) },
		}, [this.$slots.icon, this.$slots.default])
	},
}

test('entry points bundle @nextcloud/dialogs/style.css and App.vue constrains file-picker layout (#208)', () => {
	const mainJs = readFileSync(resolve(root, 'src/main.js'), 'utf8')
	const settingsJs = readFileSync(resolve(root, 'src/settings.js'), 'utf8')
	const appVue = readFileSync(resolve(root, 'src/App.vue'), 'utf8')

	assert.match(mainJs, /import\s+['"]@nextcloud\/dialogs\/style\.css['"]/)
	assert.match(settingsJs, /import\s+['"]@nextcloud\/dialogs\/style\.css['"]/)
	assert.match(appVue, /\.file-picker\s+\.file-picker__main\s*\{[\s\S]*?min-width:\s*0/)
	assert.match(appVue, /\.file-picker\s+\.file-picker__files\s+th\.row-name\s*\{[\s\S]*?width:\s*auto/)
	assert.match(appVue, /<ExcludedFoldersSettings\s+@excluded-folders-changed="refreshDuplicates"\s*\/>/)
})

test('ExcludedFoldersSettings emits excluded-folders-changed on add and remove (#208)', async () => {
	const foldersState = [{ id: 1, folderPath: '/OldArchive' }]
	let pickedPath = '/PC/Downloads'

	const ExcludedFoldersSettings = loadComponent('src/components/ExcludedFoldersSettings.vue', {
		'@nextcloud/dialogs': {
			showError: () => {},
			showSuccess: () => {},
			getFilePickerBuilder: () => ({
				setMultiSelect() { return this },
				setMimeTypeFilter() { return this },
				setType() { return this },
				allowDirectories() { return this },
				build() {
					return {
						pick: async () => pickedPath,
					}
				},
			}),
		},
		'@nextcloud/vue': { NcButton: NcButtonStub },
		'vue-material-design-icons/Delete': StubIcon,
		'vue-material-design-icons/Plus': StubIcon,
		'vue-material-design-icons/FolderRemove': StubIcon,
		'@/tools/api': {
			loadExcludedFolders: async () => [...foldersState],
			saveExcludedFolder: async path => {
				const created = { id: 2, folderPath: path }
				foldersState.push(created)
				return created
			},
			deleteExcludedFolder: async id => {
				const idx = foldersState.findIndex(f => f.id === id)
				if (idx !== -1) {
					foldersState.splice(idx, 1)
				}
			},
		},
	})

	let emittedCount = 0
	const host = new Vue({
		render(h) {
			return h(ExcludedFoldersSettings, {
				on: {
					'excluded-folders-changed': () => { emittedCount += 1 },
				},
			})
		},
	}).$mount()

	try {
		await settle()
		const comp = host.$children[0]

		await comp.pickFolder()
		await settle()
		assert.equal(emittedCount, 1, 'Adding an excluded folder must emit excluded-folders-changed')
		assert.equal(comp.excludedFolders.length, 2)

		await comp.removeFolder(comp.excludedFolders[0])
		await settle()
		assert.equal(emittedCount, 2, 'Removing an excluded folder must emit excluded-folders-changed')
	} finally {
		host.$destroy()
	}
})
