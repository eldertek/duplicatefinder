const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

function createDetailsComponent() {
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})
	const api = {
		acknowledgeDuplicate: async () => {},
		unacknowledgeDuplicate: async () => {},
		deleteFiles: async files => ({ success: [...files], errors: [] }),
		deleteFile: async () => true,
		findDuplicates: async () => {},
	}

	const Display = loadComponent('src/components/DuplicateFileDisplay.vue', {
		'@/tools/api': api,
		'@/tools/clipboardHelper': loadModule('src/tools/clipboardHelper.js'),
		'@/tools/duplicatePathDiff': loadModule('src/tools/duplicatePathDiff.js'),
		'@/tools/utils': utils,
		'@nextcloud/router': { generateUrl: url => url },
	})

	Vue.component('NcLoadingSpinner', { render: h => h('span') })

	return loadComponent('src/components/DuplicateDetails.vue', {
		'@/tools/api': api,
		'@/tools/utils': utils,
		'@/tools/duplicateSelectionAndExport': loadModule('src/tools/duplicateSelectionAndExport.js'),
		'@/tools/duplicateMetadataBadges': loadModule('src/tools/duplicateMetadataBadges.js'),
		'@/tools/duplicatePathDiff': loadModule('src/tools/duplicatePathDiff.js'),
		'@/tools/deleteSafetyGuard': loadModule('src/tools/deleteSafetyGuard.js'),
		'@/tools/duplicateGroupSummary': loadModule('src/tools/duplicateGroupSummary.js'),
		'@/tools/duplicateHashHelper': loadModule('src/tools/duplicateHashHelper.js'),
		'@/tools/clipboardHelper': loadModule('src/tools/clipboardHelper.js'),
		'@nextcloud/dialogs': { showSuccess() {}, showError() {} },
		'./DuplicateCompareView.vue': { __esModule: true, default: { render: h => h('div') } },
		'./DuplicateFileDisplay.vue': { __esModule: true, default: Display },
	})
}

describe('Cycle 112: Beyond Compare path diff, modified timestamp, and live triage status', () => {
	test('normalizePathForDiff and computePathDiffSegments handle empty, single, and malformed inputs losslessly', () => {
		const {
			normalizePathForDiff,
			computePathDiffSegments,
		} = loadModule('src/tools/duplicatePathDiff.js')

		assert.equal(normalizePathForDiff(null), '')
		assert.equal(normalizePathForDiff('   '), '')
		assert.equal(normalizePathForDiff('/alice/files'), '/')
		assert.equal(normalizePathForDiff('/alice/files/Photos/img.jpg'), '/Photos/img.jpg')
		assert.equal(normalizePathForDiff('/Photos/img.jpg'), '/Photos/img.jpg')

		assert.deepEqual(computePathDiffSegments(null), [])
		assert.deepEqual(computePathDiffSegments([]), [])
		assert.deepEqual(computePathDiffSegments([null, { path: '' }]), [[], []])

		const single = computePathDiffSegments([{ path: '/alice/files/Photos/img.jpg' }])
		assert.equal(single.length, 1)
		assert.equal(single[0].map(s => s.text).join(''), '/Photos/img.jpg')
		assert.deepEqual(single[0], [
			{ text: '/Photos/', kind: 'common' },
			{ text: 'img.jpg', kind: 'filename' },
		])
	})

	test('computePathDiffSegments highlights differing folders, shared suffixes, and differing filenames losslessly', () => {
		const { computePathDiffSegments, normalizePathForDiff } = loadModule('src/tools/duplicatePathDiff.js')

		// Case 1: Common leading folder + differing subfolder
		const branchDiff = computePathDiffSegments([
			{ path: '/alice/files/Photos/2024/Vacation/IMG_01.jpg' },
			{ path: '/alice/files/Photos/2024/Backup/IMG_01.jpg' },
		])
		assert.equal(branchDiff[0].map(s => s.text).join(''), '/Photos/2024/Vacation/IMG_01.jpg')
		assert.equal(branchDiff[1].map(s => s.text).join(''), '/Photos/2024/Backup/IMG_01.jpg')
		assert.deepEqual(branchDiff[0], [
			{ text: '/Photos/2024', kind: 'common' },
			{ text: '/Vacation', kind: 'diff' },
			{ text: '/', kind: 'common' },
			{ text: 'IMG_01.jpg', kind: 'filename' },
		])
		assert.deepEqual(branchDiff[1], [
			{ text: '/Photos/2024', kind: 'common' },
			{ text: '/Backup', kind: 'diff' },
			{ text: '/', kind: 'common' },
			{ text: 'IMG_01.jpg', kind: 'filename' },
		])

		// Case 2: Differing root + shared inner folder suffix
		const suffixShared = computePathDiffSegments([
			{ path: '/alice/files/Photos/2024/IMG_01.jpg' },
			{ path: '/alice/files/Backups/NAS/Photos/2024/IMG_01.jpg' },
		])
		assert.equal(suffixShared[0].map(s => s.text).join(''), '/Photos/2024/IMG_01.jpg')
		assert.equal(suffixShared[1].map(s => s.text).join(''), '/Backups/NAS/Photos/2024/IMG_01.jpg')
		assert.deepEqual(suffixShared[0], [
			{ text: '/Photos/2024/', kind: 'common' },
			{ text: 'IMG_01.jpg', kind: 'filename' },
		])
		assert.deepEqual(suffixShared[1], [
			{ text: '/Backups/NAS', kind: 'diff' },
			{ text: '/Photos/2024/', kind: 'common' },
			{ text: 'IMG_01.jpg', kind: 'filename' },
		])

		// Case 3: Same folder, differing filenames
		const sameFolderDiffName = computePathDiffSegments([
			{ path: '/alice/files/Docs/report.pdf' },
			{ path: '/alice/files/Docs/report (copy).pdf' },
		])
		assert.deepEqual(sameFolderDiffName[0], [
			{ text: '/Docs/', kind: 'common' },
			{ text: 'report.pdf', kind: 'diff' },
		])
		assert.deepEqual(sameFolderDiffName[1], [
			{ text: '/Docs/', kind: 'common' },
			{ text: 'report (copy).pdf', kind: 'diff' },
		])

		// Case 4: Root file vs nested folder + plain relative paths
		const rootVsNested = computePathDiffSegments([
			{ path: '/alice/files/IMG_01.jpg' },
			{ path: '/alice/files/Archive/IMG_01.jpg' },
		])
		assert.equal(rootVsNested[0].map(s => s.text).join(''), '/IMG_01.jpg')
		assert.equal(rootVsNested[1].map(s => s.text).join(''), '/Archive/IMG_01.jpg')
		assert.equal(rootVsNested[1].some(s => s.kind === 'diff' && s.text === '/Archive'), true)

		const plainRelative = computePathDiffSegments([
			{ path: 'Docs/a.txt' },
			{ path: 'Docs/b.txt' },
		])
		assert.equal(plainRelative[0].map(s => s.text).join(''), normalizePathForDiff('Docs/a.txt'))
		assert.equal(plainRelative[1].map(s => s.text).join(''), normalizePathForDiff('Docs/b.txt'))
		assert.deepEqual(plainRelative[0], [
			{ text: 'Docs/', kind: 'common' },
			{ text: 'a.txt', kind: 'diff' },
		])
	})

	test('formatFileModifiedTime handles Unix seconds, milliseconds, Date, ISO strings, and invalid inputs', () => {
		const { formatFileModifiedTime } = loadModule('src/tools/duplicatePathDiff.js')

		assert.equal(formatFileModifiedTime(null), '')
		assert.equal(formatFileModifiedTime({}), '')
		assert.equal(formatFileModifiedTime({ mtime: 0 }), '')
		assert.equal(formatFileModifiedTime({ mtime: -50 }), '')
		assert.equal(formatFileModifiedTime({ updatedAt: 'not-a-date' }), '')

		const fromSeconds = formatFileModifiedTime({ mtime: 1700000000 })
		assert.match(fromSeconds, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)

		const fromMillis = formatFileModifiedTime({ modified: 1700000000000 })
		assert.equal(fromMillis, fromSeconds)

		const fromIso = formatFileModifiedTime({ updatedAt: '2026-11-23T09:15:00+00:00' })
		assert.match(fromIso, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)

		const fromDate = formatFileModifiedTime({ lastModified: new Date('2026-06-01T12:30:00Z') })
		assert.match(fromDate, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
	})

	test('DuplicateDetails + DuplicateFileDisplay render path diff segments, modified timestamp, live triage badges, and escape XSS safely', async () => {
		const Details = createDetailsComponent()
		const duplicate = {
			id: 112,
			hash: 'deadbeef11223344',
			acknowledged: false,
			files: [
				{
					id: 1,
					nodeId: 101,
					path: '/alice/files/Backups/NAS/Photos/2024/IMG_01.jpg',
					size: 4096,
					mtime: 1730000000,
					mimetype: 'image/jpeg',
					isInOriginFolder: false,
				},
				{
					id: 2,
					nodeId: 102,
					path: '/alice/files/Photos/2024/IMG_01.jpg',
					size: 4096,
					mtime: 1700000000,
					mimetype: 'image/jpeg',
					isInOriginFolder: false,
				},
				{
					id: 3,
					nodeId: 103,
					path: '/alice/files/<img src=x onerror=alert(1)>/Photos/2024/IMG_01.jpg',
					size: 4096,
					mtime: 1715000000,
					mimetype: 'image/jpeg',
					isInOriginFolder: true,
				},
			],
		}

		const wrapper = new Vue({
			data: { duplicate },
			render(h) {
				return h(Details, {
					ref: 'details',
					props: { duplicate: this.duplicate },
				})
			},
		}).$mount()

		await settle()
		const detailsVm = wrapper.$refs.details
		const rows = () => Array.from(wrapper.$el.querySelectorAll('.file-display'))

		assert.equal(rows().length, 3)

		// 1. Beyond Compare diff segments rendered safely with lossless path text
		const row0Diffs = Array.from(rows()[0].querySelectorAll('.file-path-segment--diff')).map(el => el.textContent)
		assert.deepEqual(row0Diffs, ['/Backups/NAS'])
		assert.ok(rows()[0].querySelector('.file-path').textContent.includes('/Backups/NAS/Photos/2024/IMG_01.jpg'))

		// XSS payload in row 2 is escaped as plain text with zero injected <img> elements
		const row2Diffs = Array.from(rows()[2].querySelectorAll('.file-path-segment--diff')).map(el => el.textContent)
		assert.deepEqual(row2Diffs, ['/<img src=x onerror=alert(1)>'])
		assert.equal(wrapper.$el.querySelectorAll('img').length, 0)

		// 2. Modified timestamp badge is visible on every row
		for (const row of rows()) {
			const mtimeBadge = row.querySelector('.metadata-badge--mtime')
			assert.ok(mtimeBadge, 'Modified timestamp badge is rendered')
			assert.match(mtimeBadge.textContent.trim(), /^Modified: \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
		}

		// 3. Initial unselected status badges stay Original / Duplicate / Protected
		assert.deepEqual(
			rows().map(row => row.querySelector('.file-status-badge').textContent.trim()),
			['Original', 'Duplicate', 'Protected']
		)

		// 4. Applying Keep oldest marks row 0 (newer) as Will delete, row 1 (oldest) as Keeping, row 2 as Protected
		detailsVm.applyKeepRule('oldest')
		await settle()

		assert.equal(rows()[0].classList.contains('is-selected'), true)
		assert.equal(rows()[1].classList.contains('is-keeping'), true)
		assert.equal(rows()[2].classList.contains('is-selected'), false)
		assert.deepEqual(
			rows().map(row => row.querySelector('.file-status-badge').textContent.trim()),
			['Will delete', 'Keeping', 'Protected']
		)

		// 5. Clearing selection restores Original / Duplicate / Protected
		detailsVm.clearSelection()
		await settle()

		assert.equal(rows()[0].classList.contains('is-selected'), false)
		assert.equal(rows()[1].classList.contains('is-keeping'), false)
		assert.deepEqual(
			rows().map(row => row.querySelector('.file-status-badge').textContent.trim()),
			['Original', 'Duplicate', 'Protected']
		)

		wrapper.$destroy()
	})

	test('Cycle 112 files preserve zero typographic dashes, zero XSS sinks, and logical CSS', () => {
		for (const relPath of [
			'src/tools/duplicatePathDiff.js',
			'src/components/DuplicateFileDisplay.vue',
			'src/components/DuplicateDetails.vue',
		]) {
			const source = readFileSync(resolve(root, relPath), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(source), false, `${relPath} must have zero U+2013/U+2014 dashes`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(source), false, `${relPath} must have zero XSS sinks`)
		}
	})
})
