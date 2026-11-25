const { describe, test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

const slotBox = tag => ({
	render(h) {
		return h(tag, this.$slots.default)
	},
})

function createNavigationComponent() {
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})
	const duplicateFilters = loadModule('src/tools/duplicateFilters.js')
	const duplicatePreferences = loadModule('src/tools/duplicatePreferences.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateSortHelper = loadModule('src/tools/duplicateSortHelper.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const icon = slotBox('span')

	const DuplicateListItem = {
		props: ['duplicate', 'isActive'],
		render(h) {
			return h('div', { attrs: { 'data-dup-id': this.duplicate.id } }, this.duplicate.hash)
		},
	}

	return loadComponent('src/components/DuplicateNavigation.vue', {
		'@nextcloud/vue': {
			NcAppNavigation: {
				render(h) {
					return h('nav', this.$scopedSlots.list ? this.$scopedSlots.list() : this.$slots.default)
				},
			},
			NcAppNavigationItem: {
				props: ['name', 'allowCollapse', 'open', 'active'],
				render(h) {
					return h('section', [h('h4', this.name), this.$slots.default])
				},
			},
			NcButton: slotBox('button'),
		},
		'./DuplicateListItem.vue': { __esModule: true, default: DuplicateListItem },
		'./SearchBar.vue': {
			data() {
				return { searchQuery: '' }
			},
			methods: {
				clear() {
					this.searchQuery = ''
				},
			},
			render(h) {
				return h('input', { attrs: { type: 'search' } })
			},
		},
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
		'@/tools/duplicateFilters': duplicateFilters,
		'@/tools/duplicatePreferences': duplicatePreferences,
		'@/tools/duplicateSelectionAndExport': duplicateSelectionAndExport,
		'@/tools/duplicateSortHelper': duplicateSortHelper,
		'@/tools/duplicateStats': duplicateStats,
	})
}

function makeSampleDuplicates() {
	const MB = 1024 * 1024
	return {
		acknowledged: [
			{
				id: 100,
				hash: 'ack-archive-5x',
				acknowledged: true,
				files: [
					{ id: 1001, path: '/alice/files/Backups/bundle1.zip', mimetype: 'application/zip', size: 15 * MB },
					{ id: 1002, path: '/alice/files/Backups/bundle2.zip', mimetype: 'application/zip', size: 15 * MB },
					{ id: 1003, path: '/alice/files/Backups/bundle3.zip', mimetype: 'application/zip', size: 15 * MB },
					{ id: 1004, path: '/alice/files/Backups/bundle4.zip', mimetype: 'application/zip', size: 15 * MB },
					{ id: 1005, path: '/alice/files/Backups/bundle5.zip', mimetype: 'application/zip', size: 15 * MB },
				],
			},
		],
		unacknowledged: [
			{
				id: 1,
				hash: 'photo-3x',
				acknowledged: false,
				files: [
					{ id: 11, path: '/alice/files/Photos/holiday1.jpg', mimetype: 'image/jpeg', size: 2 * MB },
					{ id: 12, path: '/alice/files/Photos/holiday2.jpg', mimetype: 'image/jpeg', size: 2 * MB },
					{ id: 13, path: '/alice/files/Downloads/holiday3.jpg', mimetype: 'image/jpeg', size: 2 * MB },
				],
			},
			{
				id: 2,
				hash: 'video-2x',
				acknowledged: false,
				files: [
					{ id: 21, path: '/alice/files/Videos/clip1.mp4', mimetype: 'video/mp4', size: 8 * MB },
					{ id: 22, path: '/alice/files/Videos/clip2.mp4', mimetype: 'video/mp4', size: 8 * MB },
				],
			},
			{
				id: 3,
				hash: 'audio-2x',
				acknowledged: false,
				files: [
					{ id: 31, path: '/alice/files/Music/track1.mp3', mimetype: 'audio/mpeg', size: MB },
					{ id: 32, path: '/alice/files/Music/track2.mp3', mimetype: 'audio/mpeg', size: MB },
				],
			},
		],
	}
}

describe('Issue #249: Clean sidebar complexity levels, grouped sort menu, segmented category bar, and DE/FR l10n', () => {
	beforeEach(() => {
		window.localStorage.clear()
		delete window.OC.currentUser
	})

	afterEach(() => {
		window.localStorage.clear()
		delete window.OC.currentUser
	})

	test('duplicatePreferences exposes frozen uiLevel whitelist, defaults to normal, and upgrades legacy stored JSON', () => {
		const {
			DEFAULT_ALLOWED_UI_LEVELS,
			DEFAULT_TRIAGE_PREFERENCES,
			getTriagePreferencesStorageKey,
			loadTriagePreferences,
			saveTriagePreferences,
			sanitizeTriagePreferences,
		} = loadModule('src/tools/duplicatePreferences.js')

		assert.deepEqual(DEFAULT_ALLOWED_UI_LEVELS, ['normal', 'advanced', 'expert'])
		assert.equal(Object.isFrozen(DEFAULT_ALLOWED_UI_LEVELS), true)
		assert.equal(DEFAULT_TRIAGE_PREFERENCES.uiLevel, 'normal')

		// Legacy storage object without uiLevel gracefully defaults to normal
		window.OC.currentUser = 'level-tester'
		const key = getTriagePreferencesStorageKey()
		window.localStorage.setItem(key, JSON.stringify({ category: 'videos', sortKey: 'size-desc' }))
		assert.deepEqual(loadTriagePreferences(window.localStorage), {
			category: 'videos',
			sortKey: 'size-desc',
			uiLevel: 'normal',
		})

		// Valid uiLevel persists and reloads per Nextcloud user
		assert.equal(saveTriagePreferences(window.localStorage, {
			category: 'images',
			sortKey: 'reclaimable-desc',
			uiLevel: 'expert',
			secretToken: 'never-store',
		}), true)
		assert.deepEqual(loadTriagePreferences(window.localStorage), {
			category: 'images',
			sortKey: 'reclaimable-desc',
			uiLevel: 'expert',
		})

		// Disallowed / XSS uiLevel falls back cleanly to normal
		assert.deepEqual(
			sanitizeTriagePreferences({ category: 'all', sortKey: 'none', uiLevel: '<img src=x>' }),
			{ category: 'all', sortKey: 'none', uiLevel: 'normal' },
		)
	})

	test('Orca-Slicer complexity switcher (Normal / Advanced / Expert) controls sidebar visibility, persists per user, and survives Reset filters', async () => {
		window.OC.currentUser = 'orca-user'
		const DuplicateNavigation = createNavigationComponent()
		const sample = makeSampleDuplicates()

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue({
			render(h) {
				return h(DuplicateNavigation, {
					ref: 'nav',
					props: {
						acknowledgedDuplicates: sample.acknowledged,
						unacknowledgedDuplicates: sample.unacknowledged,
					},
				})
			},
		}).$mount(mountNode)

		try {
			await settle()
			const nav = vm.$refs.nav

			// 1. Default Normal mode: clean, uncluttered
			assert.equal(nav.uiLevel, 'normal')
			assert.ok(vm.$el.querySelector('.category-segmented-bar'), 'single-row category segmented bar visible in normal mode')
			assert.ok(vm.$el.querySelector('.folder-filter-input'), 'folder filter visible in normal mode')
			assert.ok(vm.$el.querySelector('.folder-filter-icon'), 'subtle folder icon inside folder filter')
			assert.ok(vm.$el.querySelector('.reclaimable-summary-badge'), 'reclaimable summary visible in normal mode')
			assert.equal(vm.$el.querySelector('.extension-insights-bar'), null, 'Top extensions hidden in normal mode')
			assert.equal(vm.$el.querySelector('button.export-csv-button'), null, 'Export CSV hidden in normal mode')
			assert.equal(vm.$el.querySelector('button.export-json-button'), null, 'Export JSON hidden in normal mode')
			assert.equal(vm.$el.querySelector('#duplicate-min-size-select'), null, 'inline min-size select hidden in normal mode')
			assert.equal(vm.$el.querySelector('#duplicate-min-copies-select'), null, 'inline min-copies select hidden in normal mode')
			assert.equal(vm.$el.querySelector('.quick-filter-actions'), null, 'empty actions container omitted when no filters active in normal mode')

			// 2. Open Sort & Filter dropdown -> switch to Advanced without closing menu
			vm.$el.querySelector('button.icon-only-button').click()
			await settle()
			const levelButtons = Array.from(vm.$el.querySelectorAll('button.ui-level-option'))
			assert.deepEqual(levelButtons.map(btn => btn.getAttribute('data-ui-level')), ['normal', 'advanced', 'expert'])
			assert.equal(levelButtons[0].getAttribute('aria-pressed'), 'true')
			assert.equal(levelButtons[1].getAttribute('aria-pressed'), 'false')

			levelButtons[1].click()
			await settle()
			assert.equal(nav.uiLevel, 'advanced')
			assert.equal(nav.showSortMenu, true, 'switching interface mode keeps sort menu open for immediate preview')
			assert.equal(levelButtons[1].getAttribute('aria-pressed'), 'true')
			assert.ok(vm.$el.querySelector('.extension-insights-bar'), 'Top extensions appears in advanced mode')
			assert.ok(vm.$el.querySelector('button.largest-group-jump-button'), 'Largest jump button appears in advanced mode')
			assert.ok(vm.$el.querySelector('button.export-csv-button'), 'Export CSV appears in advanced mode')
			assert.ok(vm.$el.querySelector('button.export-json-button'), 'Export JSON appears in advanced mode')
			assert.equal(vm.$el.querySelector('#duplicate-min-size-select'), null, 'inline min-size still hidden in advanced mode')
			assert.equal(vm.$el.querySelector('#duplicate-min-copies-select'), null, 'inline min-copies still hidden in advanced mode')

			// 3. Switch to Expert -> reveals side-by-side 2-column inline min-size & min-copies row
			levelButtons[2].click()
			await settle()
			assert.equal(nav.uiLevel, 'expert')
			assert.ok(vm.$el.querySelector('.expert-inline-filters-row'), '2-column inline filters row appears in expert mode')
			assert.ok(vm.$el.querySelector('#duplicate-min-size-select'), 'inline min-size select visible in expert mode')
			assert.ok(vm.$el.querySelector('#duplicate-min-copies-select'), 'inline min-copies select visible in expert mode')

			// 4. Reset filters preserves chosen uiLevel ('expert')
			nav.setCategoryFilter('images')
			await settle()
			const resetBtn = vm.$el.querySelector('button.reset-filters-button')
			assert.ok(resetBtn)
			resetBtn.click()
			await settle()
			assert.equal(nav.selectedCategory, 'all')
			assert.equal(nav.uiLevel, 'expert', 'resetting filters must not downgrade user uiLevel')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}

		// 5. Remount restores persisted 'expert' uiLevel for orca-user
		const reloadedVm = new Vue({
			render(h) {
				return h(DuplicateNavigation, {
					ref: 'nav',
					props: {
						acknowledgedDuplicates: sample.acknowledged,
						unacknowledgedDuplicates: sample.unacknowledged,
					},
				})
			},
		}).$mount()
		try {
			await settle()
			assert.equal(reloadedVm.$refs.nav.uiLevel, 'expert')
			assert.ok(reloadedVm.$el.querySelector('#duplicate-min-size-select'))
			assert.ok(reloadedVm.$el.querySelector('#duplicate-min-copies-select'))
		} finally {
			reloadedVm.$destroy()
		}
	})

	test('Sort & Filter menu groups Minimum copies with Sort order and Minimum file size and lights up active indicator dot', async () => {
		const DuplicateNavigation = createNavigationComponent()
		const sample = makeSampleDuplicates()

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue({
			render(h) {
				return h(DuplicateNavigation, {
					ref: 'nav',
					props: {
						acknowledgedDuplicates: sample.acknowledged,
						unacknowledgedDuplicates: sample.unacknowledged,
					},
				})
			},
		}).$mount(mountNode)

		try {
			await settle()
			const nav = vm.$refs.nav
			const sortToggle = vm.$el.querySelector('button.icon-only-button')
			assert.equal(nav.hasActiveSortOrFilter, false)
			assert.equal(vm.$el.querySelector('.active-filter-dot'), null)

			// Open Sort & Filter menu
			sortToggle.click()
			await settle()
			const minCopiesOptions = Array.from(vm.$el.querySelectorAll('button.min-copies-menu-option'))
			assert.deepEqual(minCopiesOptions.map(btn => btn.getAttribute('data-min-copies')), ['any', '3plus', '5plus'])
			assert.equal(minCopiesOptions[0].getAttribute('aria-pressed'), 'true')

			// Pick 3+ copies inside sort menu -> filters list, closes menu, lights up indicator dot
			minCopiesOptions[1].click()
			await settle()
			assert.equal(nav.selectedMinCopiesPreset, '3plus')
			assert.equal(nav.showSortMenu, false)
			assert.equal(nav.hasActiveSortOrFilter, true)
			assert.ok(vm.$el.querySelector('.active-filter-dot'), 'active indicator dot lights up when min copies is active')
			assert.deepEqual(nav.filteredUnacknowledgedDuplicates.map(d => d.id), [1])
			assert.deepEqual(nav.filteredAcknowledgedDuplicates.map(d => d.id), [100])

			// Reopen menu and select 5+ copies -> keeps only the 5-copy acknowledged archive
			sortToggle.click()
			await settle()
			const reopenedOptions = Array.from(vm.$el.querySelectorAll('button.min-copies-menu-option'))
			assert.equal(reopenedOptions[1].getAttribute('aria-pressed'), 'true')
			reopenedOptions[2].click()
			await settle()
			assert.equal(nav.selectedMinCopiesPreset, '5plus')
			assert.deepEqual(nav.filteredUnacknowledgedDuplicates.map(d => d.id), [])
			assert.deepEqual(nav.filteredAcknowledgedDuplicates.map(d => d.id), [100])

			// Outside click closes sort menu cleanly
			sortToggle.click()
			await settle()
			assert.equal(nav.showSortMenu, true)
			document.body.click()
			await settle()
			assert.equal(nav.showSortMenu, false)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('Single-row File-Type segmented bar (All | Images | Videos | More) opens popover with live counts and dismisses on Escape or outside click', async () => {
		const DuplicateNavigation = createNavigationComponent()
		const sample = makeSampleDuplicates()

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue({
			render(h) {
				return h(DuplicateNavigation, {
					ref: 'nav',
					props: {
						acknowledgedDuplicates: sample.acknowledged,
						unacknowledgedDuplicates: sample.unacknowledged,
					},
				})
			},
		}).$mount(mountNode)

		try {
			await settle()
			const nav = vm.$refs.nav

			const segments = Array.from(vm.$el.querySelectorAll('.category-segmented-bar > button.category-segment'))
			assert.equal(segments.length, 4, 'segmented bar renders exactly 4 controls in a single row')
			assert.equal(segments[0].textContent.replace(/\s+/g, ' ').trim(), 'All (4)')
			assert.equal(segments[1].textContent.trim(), 'Images')
			assert.equal(segments[2].textContent.trim(), 'Videos')
			assert.equal(segments[3].textContent.trim(), 'More')
			assert.equal(vm.$el.querySelector('.category-more-menu'), null)

			// Open More popover
			segments[3].click()
			await settle()
			assert.equal(segments[3].getAttribute('aria-expanded'), 'true')
			const moreMenu = vm.$el.querySelector('.category-more-menu')
			assert.ok(moreMenu, 'More popover opens on click')
			const moreOptions = Array.from(moreMenu.querySelectorAll('button.category-more-option'))
			assert.deepEqual(
				moreOptions.map(opt => opt.textContent.replace(/\s+/g, ' ').trim()),
				['Audio (1)', 'Documents (0)', 'Archives (1)', '> 10 MB (1)'],
			)

			// Escape key closes More popover cleanly
			moreMenu.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
			await settle()
			assert.equal(nav.showMoreCategoriesMenu, false)
			assert.equal(segments[3].getAttribute('aria-expanded'), 'false')

			// Reopen and click outside -> closes popover cleanly
			segments[3].click()
			await settle()
			assert.equal(nav.showMoreCategoriesMenu, true)
			document.body.click()
			await settle()
			assert.equal(nav.showMoreCategoriesMenu, false)

			// Reopen and select Archives -> Segment 4 highlights and displays Archives
			segments[3].click()
			await settle()
			vm.$el.querySelector('button.category-more-option[data-category="archives"]').click()
			await settle()
			assert.equal(nav.selectedCategory, 'archives')
			assert.equal(nav.showMoreCategoriesMenu, false)
			assert.equal(segments[3].classList.contains('active'), true)
			assert.equal(segments[3].textContent.trim(), 'Archives')
			assert.deepEqual(nav.filteredAcknowledgedDuplicates.map(d => d.id), [100])
			assert.deepEqual(nav.filteredUnacknowledgedDuplicates.map(d => d.id), [])

			// Clicking primary segment Images resets Segment 4 back to More
			segments[1].click()
			await settle()
			assert.equal(nav.selectedCategory, 'images')
			assert.equal(segments[3].classList.contains('active'), false)
			assert.equal(segments[3].textContent.trim(), 'More')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('German (de, de_DE) and French (fr) translations cover 100% of DuplicateNavigation keys with exact placeholders and zero English leaks', () => {
		const navSource = readFileSync(resolve(root, 'src/components/DuplicateNavigation.vue'), 'utf8')
		const sidebarKeys = [...new Set([...navSource.matchAll(/t\('duplicatefinder',\s*'([^']+)'/g)].map(m => m[1]))]
		assert.ok(sidebarKeys.length >= 60, `expected >= 60 sidebar l10n keys, got ${sidebarKeys.length}`)

		const requiredDe = {
			'Interface mode': 'Ansichtsmodus',
			Normal: 'Normal',
			Advanced: 'Erweitert',
			Expert: 'Experte',
			All: 'Alle',
			Images: 'Bilder',
			Videos: 'Videos',
			More: 'Mehr',
			Audio: 'Audio',
			Documents: 'Dokumente',
			Archives: 'Archive',
			'Folder filter (/Photos or !/Backups)': 'Ordnerfilter (/Photos oder !/Backups)',
			'Minimum copies': 'Mindestanzahl Kopien',
			'Any size': 'Alle Größen',
			'Any count': 'Alle Anzahlen',
			'3+ copies': '3+ Kopien',
			'5+ copies': '5+ Kopien',
			'Reclaimable: {size}': 'Freigebbar: {size}',
			'Reclaimable space (most wasted first)': 'Einsparpotenzial (größtes zuerst)',
			'Export CSV': 'CSV exportieren',
			'Export JSON': 'JSON exportieren',
			'Top extensions': 'Top-Dateiendungen',
			'No duplicates found yet': 'Noch keine Duplikate gefunden',
			'No duplicates match the current filters': 'Keine Duplikate entsprechen den aktuellen Filtern',
			'Reset filters': 'Filter zurücksetzen',
			'Reset filters ({count})': 'Filter zurücksetzen ({count})',
		}

		const requiredFr = {
			'Interface mode': "Mode d'affichage",
			Normal: 'Normal',
			Advanced: 'Avancé',
			Expert: 'Expert',
			All: 'Tous',
			Images: 'Images',
			Videos: 'Vidéos',
			More: 'Plus',
			Audio: 'Audio',
			Documents: 'Documents',
			Archives: 'Archives',
			'Folder filter (/Photos or !/Backups)': 'Filtre dossier (/Photos ou !/Backups)',
			'Minimum copies': 'Nombre minimal de copies',
			'Any size': 'Toutes tailles',
			'Any count': 'Tous les groupes',
			'3+ copies': '3+ copies',
			'5+ copies': '5+ copies',
			'Reclaimable: {size}': 'Récupérable : {size}',
			'Reclaimable space (most wasted first)': "Espace récupérable (plus élevé d'abord)",
			'Export CSV': 'Exporter CSV',
			'Export JSON': 'Exporter JSON',
			'Top extensions': 'Principales extensions',
			'No duplicates found yet': 'Aucun doublon trouvé pour le moment',
			'No duplicates match the current filters': 'Aucun doublon ne correspond aux filtres actifs',
			'Reset filters': 'Réinitialiser les filtres',
			'Reset filters ({count})': 'Réinitialiser les filtres ({count})',
		}

		const placeholderRegex = /\{[a-zA-Z0-9_]+\}/g

		for (const [locale, requiredMap] of [
			['de', requiredDe],
			['de_DE', requiredDe],
			['fr', requiredFr],
		]) {
			const jsonRaw = readFileSync(resolve(root, `l10n/${locale}.json`), 'utf8')
			const jsRaw = readFileSync(resolve(root, `l10n/${locale}.js`), 'utf8')
			const fallbackRaw = readFileSync(resolve(root, `l10n-fallback/${locale}.json`), 'utf8')

			for (const raw of [jsonRaw, jsRaw, fallbackRaw]) {
				assert.equal(/[\u2013\u2014]/.test(raw), false, `${locale} l10n files must have zero U+2013/U+2014 dashes`)
			}

			const jsonTranslations = JSON.parse(jsonRaw).translations
			const fallbackTranslations = JSON.parse(fallbackRaw).translations

			let jsTranslations = null
			new Function('OC', jsRaw)({
				L10N: {
					register(appId, map) {
						assert.equal(appId, 'duplicatefinder')
						jsTranslations = map
					},
				},
			})
			assert.ok(jsTranslations, `l10n/${locale}.js registers translations cleanly`)

			for (const key of sidebarKeys) {
				assert.equal(typeof jsonTranslations[key], 'string', `l10n/${locale}.json missing key "${key}"`)
				assert.ok(jsonTranslations[key].trim().length > 0, `l10n/${locale}.json empty key "${key}"`)
				assert.equal(jsTranslations[key], jsonTranslations[key], `l10n/${locale}.js must match json for "${key}"`)

				const expectedPlaceholders = (key.match(placeholderRegex) || []).sort()
				const actualPlaceholders = (jsonTranslations[key].match(placeholderRegex) || []).sort()
				assert.deepEqual(actualPlaceholders, expectedPlaceholders, `placeholder mismatch in ${locale} for "${key}"`)
			}

			for (const [key, expectedVal] of Object.entries(requiredMap)) {
				assert.equal(jsonTranslations[key], expectedVal, `l10n/${locale}.json mismatch for "${key}"`)
				assert.equal(jsTranslations[key], expectedVal, `l10n/${locale}.js mismatch for "${key}"`)
				assert.equal(fallbackTranslations[key], expectedVal, `l10n-fallback/${locale}.json mismatch for "${key}"`)
			}
		}
	})

	test('Issue #249 source and CSS enforce scrollable opaque sort-menu, logical CSS, >= 44px targets, focus-visible, and zero XSS/dashes', () => {
		const navSource = readFileSync(resolve(root, 'src/components/DuplicateNavigation.vue'), 'utf8')
		const prefsSource = readFileSync(resolve(root, 'src/tools/duplicatePreferences.js'), 'utf8')

		for (const content of [navSource, prefsSource]) {
			assert.equal(/[\u2013\u2014]/.test(content), false, 'no U+2013/U+2014 dashes allowed')
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, 'no DOM XSS sinks allowed')
		}

		assert.ok(navSource.includes('max-block-size: min(75vh, 560px)'))
		assert.ok(navSource.includes('overflow-y: auto'))
		assert.ok(navSource.includes('.ui-level-option:focus-visible'))
		assert.ok(navSource.includes('.category-segment:focus-visible'))
		assert.ok(navSource.includes('.category-more-trigger:focus-visible'))
		assert.ok(navSource.includes('.category-more-option:focus-visible'))
		assert.ok(navSource.includes('grid-template-columns: repeat(4, minmax(0, 1fr))'))
		assert.ok(navSource.includes('grid-template-columns: repeat(2, minmax(0, 1fr))'))

		const filterCssStart = navSource.indexOf('/* Quick File-Type Filter Chips & Live Reclaimable Summary */')
		const filterCssEnd = navSource.indexOf('/* Consistent highlighting')
		const filterCssBlock = navSource.slice(filterCssStart, filterCssEnd)
		assert.equal(/(?:margin|padding|border)-(?:left|right|top|bottom)/.test(filterCssBlock), false, 'quick filter CSS uses logical properties only')
	})
})
