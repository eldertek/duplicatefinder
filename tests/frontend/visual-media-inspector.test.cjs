const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, document, window } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

function buildSyntheticPng(width, height) {
	const buf = new Uint8Array(24)
	const view = new DataView(buf.buffer)
	buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
	view.setUint32(8, 13, false)
	buf.set([0x49, 0x48, 0x44, 0x52], 12) // IHDR
	view.setUint32(16, width, false)
	view.setUint32(20, height, false)
	return buf.buffer
}

function buildSyntheticJpegWithExif({ width, height, make, model, iso, focalMm, fNumber, gps }) {
	const chunks = []
	const pushBytes = arr => chunks.push(...arr)
	const pushU16BE = v => chunks.push((v >> 8) & 0xff, v & 0xff)

	// SOI
	pushBytes([0xff, 0xd8])

	// Build minimal little-endian TIFF block
	const tiff = []
	const wU16 = v => tiff.push(v & 0xff, (v >> 8) & 0xff)
	const wU32 = v => tiff.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff)
	const writeAscii = str => {
		const bytes = []
		for (let i = 0; i < str.length; i++) {
			bytes.push(str.charCodeAt(i) & 0x7f)
		}
		bytes.push(0)
		return bytes
	}

	// Header: 'II', 42, ifd0Offset = 8
	tiff.push(0x49, 0x49)
	wU16(42)
	wU32(8)

	const makeBytes = writeAscii(make)
	const modelBytes = writeAscii(model)

	// IFD0 entries: Make (0x010f), Model (0x0110), Orientation (0x0112), ExifIFD (0x8769), optional GPS (0x8825)
	const ifd0Count = gps ? 5 : 4
	const ifd0Start = 8
	const ifd0Size = 2 + (ifd0Count * 12) + 4
	const exifIfdOffset = ifd0Start + ifd0Size
	const exifCount = 3 // FNumber (0x829d), ISO (0x8827), FocalLength (0x920a)
	const exifSize = 2 + (exifCount * 12) + 4
	const gpsIfdOffset = exifIfdOffset + exifSize
	const gpsSize = gps ? (2 + 12 + 4) : 0
	let dataCursor = gpsIfdOffset + gpsSize

	const makeOffset = dataCursor
	dataCursor += makeBytes.length
	const modelOffset = dataCursor
	dataCursor += modelBytes.length
	const fNumOffset = dataCursor
	dataCursor += 8
	const focalOffset = dataCursor
	dataCursor += 8

	// Write IFD0
	wU16(ifd0Count)
	const writeIfdEntry = (tag, type, count, valOrOffset) => {
		wU16(tag)
		wU16(type)
		wU32(count)
		wU32(valOrOffset)
	}
	writeIfdEntry(0x010f, 2, makeBytes.length, makeOffset)
	writeIfdEntry(0x0110, 2, modelBytes.length, modelOffset)
	writeIfdEntry(0x0112, 3, 1, 6) // Rotate 90 CW
	writeIfdEntry(0x8769, 4, 1, exifIfdOffset)
	if (gps) {
		writeIfdEntry(0x8825, 4, 1, gpsIfdOffset)
	}
	wU32(0)

	// Write ExifIFD
	wU16(exifCount)
	writeIfdEntry(0x829d, 5, 1, fNumOffset)
	writeIfdEntry(0x8827, 3, 1, iso)
	writeIfdEntry(0x920a, 5, 1, focalOffset)
	wU32(0)

	// Optional GPS IFD
	if (gps) {
		wU16(1)
		writeIfdEntry(0x0000, 1, 4, 0x02020000)
		wU32(0)
	}

	// Write trailing data
	tiff.push(...makeBytes, ...modelBytes)
	// FNumber rational (fNumber * 10 / 10)
	wU32(Math.round(fNumber * 10))
	wU32(10)
	// FocalLength rational
	wU32(focalMm)
	wU32(1)

	// APP1 marker
	pushBytes([0xff, 0xe1])
	pushU16BE(2 + 6 + tiff.length)
	pushBytes([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]) // Exif\0\0
	pushBytes(tiff)

	// SOF0 marker (baseline DCT dimensions)
	pushBytes([0xff, 0xc0])
	pushU16BE(11)
	pushBytes([8])
	pushU16BE(height)
	pushU16BE(width)
	pushBytes([3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1])

	// EOI
	pushBytes([0xff, 0xd9])
	return new Uint8Array(chunks).buffer
}

function createDetailsWithVisualInspector() {
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const pathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const stats = loadModule('src/tools/duplicateStats.js')
	const compare = loadModule('src/tools/duplicateCompare.js', {
		'./duplicatePathDiff': pathDiff,
	})
	const visualInspector = loadModule('src/tools/visualMediaInspector.js')

	const api = {
		acknowledgeDuplicate: async () => {},
		unacknowledgeDuplicate: async () => {},
		deleteFiles: async files => ({ success: [...files], errors: [] }),
		deleteFile: async () => true,
		findDuplicates: async () => {},
	}

	const Display = loadComponent('src/components/DuplicateFileDisplay.vue', {
		'@/tools/api': api,
		'@/tools/clipboardHelper': clipboardHelper,
		'@/tools/duplicatePathDiff': pathDiff,
		'@/tools/utils': utils,
		'@nextcloud/router': { generateUrl: url => url },
	})

	const CompareView = loadComponent('src/components/DuplicateCompareView.vue', {
		'@nextcloud/router': { generateUrl: url => url },
		'../tools/clipboardHelper': clipboardHelper,
		'../tools/duplicateCompare': compare,
		'../tools/duplicateStats': stats,
		'../tools/utils': utils,
		'../tools/visualMediaInspector': visualInspector,
	})

	Vue.component('NcLoadingSpinner', { render: h => h('span') })

	return loadComponent('src/components/DuplicateDetails.vue', {
		'@/tools/api': api,
		'@/tools/utils': utils,
		'@/tools/duplicateSelectionAndExport': loadModule('src/tools/duplicateSelectionAndExport.js'),
		'@/tools/duplicateMetadataBadges': loadModule('src/tools/duplicateMetadataBadges.js'),
		'@/tools/duplicatePathDiff': pathDiff,
		'@/tools/deleteSafetyGuard': loadModule('src/tools/deleteSafetyGuard.js'),
		'@/tools/duplicateGroupSummary': loadModule('src/tools/duplicateGroupSummary.js'),
		'@/tools/duplicateHashHelper': loadModule('src/tools/duplicateHashHelper.js'),
		'@/tools/visualMediaInspector': visualInspector,
		'@/tools/clipboardHelper': clipboardHelper,
		'@nextcloud/dialogs': { showSuccess() {}, showError() {} },
		'./DuplicateCompareView.vue': { __esModule: true, default: CompareView },
		'./DuplicateFileDisplay.vue': { __esModule: true, default: Display },
	})
}

describe('Cycle 120: Visual Perceptual Image/Media Diff & EXIF/Resolution Winner Inspector', () => {
	test('visualMediaInspector computes dimensions, aspect ratios, resolution winners, and lower-res selection safely', () => {
		const inspector = loadModule('src/tools/visualMediaInspector.js')

		assert.equal(inspector.isRasterImageMimetype('image/jpeg'), true)
		assert.equal(inspector.isRasterImageMimetype('image/svg+xml'), false)
		assert.equal(inspector.isRasterImageMimetype('video/mp4'), false)
		assert.equal(inspector.isVisualMediaMimetype('video/mp4'), true)

		assert.equal(inspector.computeAspectRatioLabel(1920, 1080), '16:9')
		assert.equal(inspector.computeAspectRatioLabel(4000, 3000), '4:3')
		assert.equal(inspector.computeAspectRatioLabel(1080, 1080), '1:1')
		assert.equal(inspector.computeMegapixelsLabel(4000, 3000), '12 MP')
		assert.equal(inspector.classifyOrientation(1920, 1080), 'landscape')
		assert.equal(inspector.classifyOrientation(1080, 1920), 'portrait')
		assert.equal(inspector.classifyOrientation(500, 500), 'square')

		const files = [
			{ id: 1, path: '/alice/files/Origin/photo.jpg', size: 1500000, mimetype: 'image/jpeg', width: 1920, height: 1080, isInOriginFolder: true },
			{ id: 2, path: '/alice/files/Exports/photo_4k.jpg', size: 4200000, mimetype: 'image/jpeg', width: 3840, height: 2160, isInOriginFolder: false },
			{ id: 3, path: '/alice/files/Thumb/photo_hd.jpg', size: 500000, mimetype: 'image/jpeg', width: 1920, height: 1080, isInOriginFolder: false },
		]

		const evaluation = inspector.evaluateResolutionWinners(files)
		assert.equal(evaluation.hasVisualMedia, true)
		assert.equal(evaluation.hasDimensionSpread, true)
		assert.equal(evaluation.winnerIndex, 1)
		assert.equal(evaluation.perFile[1].isResolutionWinner, true)
		assert.equal(evaluation.perFile[0].isLowerResolution, true)
		assert.equal(evaluation.perFile[0].deltaVsBestPercent, -75)

		// Lower-res selection never includes protected origin folder copy (id 1) or winner (id 2)
		const keysToDelete = inspector.selectLowerResolutionKeys(files)
		assert.deepEqual(keysToDelete, [3])

		// Exact dimension match detection
		const exactEval = inspector.evaluateResolutionWinners([
			{ id: 10, path: '/a.jpg', size: 1000, mimetype: 'image/jpeg', width: 1200, height: 800 },
			{ id: 11, path: '/b.jpg', size: 1000, mimetype: 'image/jpeg', width: 1200, height: 800 },
		])
		assert.equal(exactEval.hasDimensionSpread, false)
		assert.equal(exactEval.isExactDimensionMatch, true)
		assert.equal(exactEval.perFile[0].isExactDimensionMatch, true)
	})

	test('parseImageHeaderAndExif parses PNG, JPEG + EXIF TIFF IFDs, and handles corrupt buffers safely', () => {
		const inspector = loadModule('src/tools/visualMediaInspector.js')

		const png = inspector.parseImageHeaderAndExif(buildSyntheticPng(2560, 1440))
		assert.equal(png.format, 'PNG')
		assert.equal(png.width, 2560)
		assert.equal(png.height, 1440)

		const jpegBuf = buildSyntheticJpegWithExif({
			width: 4032,
			height: 3024,
			make: 'Canon',
			model: 'Canon EOS R5',
			iso: 400,
			focalMm: 50,
			fNumber: 2.8,
			gps: true,
		})
		const jpeg = inspector.parseImageHeaderAndExif(jpegBuf)
		assert.equal(jpeg.format, 'JPEG')
		assert.equal(jpeg.width, 4032)
		assert.equal(jpeg.height, 3024)
		assert.equal(jpeg.exif.make, 'Canon')
		assert.equal(jpeg.exif.model, 'Canon EOS R5')
		assert.equal(jpeg.exif.iso, 400)
		assert.equal(jpeg.exif.orientation, 6)
		assert.equal(jpeg.exif.gpsPresent, true)

		const normalized = inspector.normalizeExifMetadata({}, jpeg)
		assert.equal(normalized.camera, 'Canon EOS R5')
		assert.equal(normalized.iso, 'ISO 400')
		assert.equal(normalized.aperture, 'f/2.8')
		assert.equal(normalized.focalLength, '50 mm')
		assert.equal(normalized.gpsPresent, true)
		assert.equal(normalized.gpsLabel, 'GPS metadata present')

		assert.equal(inspector.parseImageHeaderAndExif(null), null)
		assert.equal(inspector.parseImageHeaderAndExif(new Uint8Array([1, 2, 3])), null)
	})

	test('computeDifferenceHash, computeHammingSimilarity, and computePixelDiffMetrics quantify perceptual & pixel similarity', () => {
		const inspector = loadModule('src/tools/visualMediaInspector.js')

		const w = 18
		const h = 16
		const makeGradient = offset => {
			const buf = new Uint8ClampedArray(w * h * 4)
			for (let y = 0; y < h; y++) {
				for (let x = 0; x < w; x++) {
					const idx = (y * w + x) * 4
					const v = Math.min(255, Math.max(0, (x * 12) + offset))
					buf[idx] = v
					buf[idx + 1] = v
					buf[idx + 2] = v
					buf[idx + 3] = 255
				}
			}
			return buf
		}

		const frameA = makeGradient(0)
		const frameB = makeGradient(0)
		const hashA = inspector.computeDifferenceHash(frameA, w, h)
		const hashB = inspector.computeDifferenceHash(frameB, w, h)
		assert.equal(hashA.hex.length, 16)
		assert.deepEqual(inspector.computeHammingSimilarity(hashA, hashB), {
			distance: 0,
			similarityPercent: 100,
		})

		const identicalMetrics = inspector.computePixelDiffMetrics(frameA, frameB, w, h, 12)
		assert.equal(identicalMetrics.pixelMatchPercent, 100)
		assert.equal(identicalMetrics.changedPixelCount, 0)
		assert.equal(identicalMetrics.similarityVerdict, 'identical')

		const frameC = makeGradient(0)
		frameC[0] = 255
		frameC[1] = 0
		frameC[2] = 0
		const diffMetrics = inspector.computePixelDiffMetrics(frameA, frameC, w, h, 12)
		assert.equal(diffMetrics.changedPixelCount, 1)
		assert.ok(diffMetrics.maxChannelDelta >= 200)
		assert.equal(diffMetrics.similarityVerdict, 'near-identical')
	})

	test('DuplicateDetails & DuplicateCompareView expose resolution winner, split wipe, pixel diff, zoom, EXIF header load, and keep 3 keep-rule buttons', async () => {
		const Details = createDetailsWithVisualInspector()
		const originalFetch = globalThis.fetch
		const syntheticJpegBuf = buildSyntheticJpegWithExif({
			width: 3840,
			height: 2160,
			make: 'Sony',
			model: 'ILCE-7M4',
			iso: 200,
			focalMm: 35,
			fNumber: 1.8,
			gps: false,
		})
		globalThis.fetch = async () => ({
			ok: true,
			arrayBuffer: async () => syntheticJpegBuf,
		})

		const duplicate = {
			id: 920,
			hash: 'visual-inspector-hash',
			acknowledged: false,
			files: [
				{
					id: 101,
					nodeId: 201,
					path: '/alice/files/Archive/photo_hd.jpg',
					size: 900000,
					mtime: 1700000100,
					mimetype: 'image/jpeg',
					width: 1920,
					height: 1080,
					exif: { make: 'Sony', model: 'ILCE-7M4', iso: 200 },
					isInOriginFolder: false,
				},
				{
					id: 102,
					nodeId: 202,
					path: '/alice/files/Origin/photo_4k.jpg',
					size: 3800000,
					mtime: 1700000000,
					mimetype: 'image/jpeg',
					width: 3840,
					height: 2160,
					exif: { make: 'Sony', model: 'ILCE-7M4', iso: 200 },
					isInOriginFolder: false,
				},
			],
		}

		const wrapper = new Vue({
			render(h) {
				return h(Details, { props: { duplicate } })
			},
		}).$mount()
		document.body.appendChild(wrapper.$el)

		try {
			await settle()
			const detailsEl = wrapper.$el

			// Existing 3 keep-rule buttons preserved strictly
			assert.equal(detailsEl.querySelectorAll('button.keep-rule-button').length, 3)

			// List view shows resolution winner & dimensions badges + Keep best resolution button
			assert.ok(detailsEl.textContent.includes('Resolution winner'))
			assert.ok(detailsEl.textContent.includes('Lower resolution (-75%)'))
			assert.ok(detailsEl.textContent.includes('3840 x 2160 px (16:9)'))

			const keepBestBtn = detailsEl.querySelector('.resolution-winner-keep-button')
			assert.ok(keepBestBtn, 'Keep best resolution button exists when dimension spread is detected')
			keepBestBtn.click()
			await settle()
			assert.deepEqual(wrapper.$children[0].selectedFiles.map(f => f.id), [101])

			// Click Inspect visual diff -> opens CompareView in Pixel diff mode
			const inspectBtn = detailsEl.querySelector('.group-header-summary__inspect-button')
			assert.ok(inspectBtn)
			inspectBtn.click()
			await settle()

			const workspace = detailsEl.querySelector('.compare-workspace')
			assert.ok(workspace)
			assert.ok(workspace.querySelector('.compare-diff-stage'), 'Pixel diff stage is active')

			// Switch to Split wipe mode and move slider
			const wipeBtn = workspace.querySelector('.compare-mode-wipe-button')
			wipeBtn.click()
			await settle()
			const wipeStage = workspace.querySelector('.compare-wipe-stage')
			assert.ok(wipeStage)
			const slider = wipeStage.querySelector('#compare-wipe-slider')
			slider.value = '72'
			slider.dispatchEvent(new window.Event('input', { bubbles: true }))
			await settle()
			assert.equal(wipeStage.querySelector('.compare-wipe-stage__ratio').textContent.trim(), '72%')

			// Zoom 2x button applies scale(2)
			const zoomButtons = Array.from(workspace.querySelectorAll('.compare-zoom-button'))
			const zoom2x = zoomButtons.find(btn => btn.textContent.trim() === '2x')
			zoom2x.click()
			await settle()
			assert.equal(zoom2x.getAttribute('aria-pressed'), 'true')

			// Explicit Read EXIF header button parses EXIF without error
			const exifBtn = workspace.querySelector('.compare-exif-fetch-button')
			exifBtn.click()
			await settle()
			assert.ok(exifBtn.textContent.includes('EXIF inspected'))
		} finally {
			globalThis.fetch = originalFetch
			wrapper.$destroy()
			wrapper.$el.remove()
		}
	})

	test('DuplicateCompareView sanitizes XSS payloads in EXIF/paths and follows all craft standards', async () => {
		const Details = createDetailsWithVisualInspector()
		const xss = '<img src=x onerror=alert(1)>'
		const duplicate = {
			id: 921,
			hash: 'xss-visual-hash',
			acknowledged: false,
			files: [
				{ id: 1, nodeId: 11, path: `/alice/files/A/${xss}.jpg`, size: 1000, mimetype: 'image/jpeg', width: 800, height: 600, exif: { camera: xss } },
				{ id: 2, nodeId: 12, path: `/alice/files/B/${xss}.jpg`, size: 1000, mimetype: 'image/jpeg', width: 800, height: 600, exif: { camera: xss } },
			],
		}
		const wrapper = new Vue({
			render(h) {
				return h(Details, { props: { duplicate } })
			},
		}).$mount()
		document.body.appendChild(wrapper.$el)

		try {
			await settle()
			wrapper.$children[0].toggleCompareMode()
			await settle()
			const workspace = wrapper.$el.querySelector('.compare-workspace')
			assert.ok(workspace)
			assert.equal(workspace.querySelectorAll('img[src="x"]').length, 0)
			assert.ok(workspace.textContent.includes(xss))
		} finally {
			wrapper.$destroy()
			wrapper.$el.remove()
		}
	})

	test('Cycle 120 touched files have zero U+2013/U+2014 dashes, zero XSS sinks, and logical CSS + 44px guards', () => {
		const filesToCheck = [
			'src/tools/visualMediaInspector.js',
			'src/components/DuplicateCompareView.vue',
			'src/components/DuplicateDetails.vue',
			'src/components/DuplicateFileDisplay.vue',
		]
		for (const relPath of filesToCheck) {
			const src = readFileSync(resolve(root, relPath), 'utf8')
			assert.ok(!/[\u2013\u2014]/.test(src), `${relPath} has zero U+2013/U+2014 dashes`)
			assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(src), `${relPath} has zero XSS sinks`)
		}
		const compareSrc = readFileSync(resolve(root, 'src/components/DuplicateCompareView.vue'), 'utf8')
		assert.ok(compareSrc.includes('minmax(0, 1fr)'))
		assert.ok(compareSrc.includes('min-block-size: 44px'))
		assert.ok(compareSrc.includes(':focus-visible'))
	})
})
