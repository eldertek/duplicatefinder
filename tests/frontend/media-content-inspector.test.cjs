const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, document, window } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

function writeAscii(buf, offset, str) {
	for (let i = 0; i < str.length; i++) {
		buf[offset + i] = str.charCodeAt(i)
	}
}

function buildSyntheticMp4({ brand = 'isom', timescale = 1000, duration = 90000, width = 1920, height = 1080 } = {}) {
	// ftyp (20) + moov (8 + mvhd(28) + trak(8 + tkhd(92))) = 156 bytes
	const buf = new Uint8Array(156)
	const view = new DataView(buf.buffer)
	view.setUint32(0, 20, false)
	writeAscii(buf, 4, 'ftyp')
	writeAscii(buf, 8, brand)
	view.setUint32(12, 512, false)
	writeAscii(buf, 16, 'isom')

	const moovStart = 20
	const mvhdSize = 28
	const tkhdSize = 92
	const trakSize = 8 + tkhdSize
	const moovSize = 8 + mvhdSize + trakSize

	view.setUint32(moovStart, moovSize, false)
	writeAscii(buf, moovStart + 4, 'moov')

	const mvhdStart = moovStart + 8
	view.setUint32(mvhdStart, mvhdSize, false)
	writeAscii(buf, mvhdStart + 4, 'mvhd')
	buf[mvhdStart + 8] = 0 // version 0
	view.setUint32(mvhdStart + 20, timescale, false)
	view.setUint32(mvhdStart + 24, duration, false)

	const trakStart = mvhdStart + mvhdSize
	view.setUint32(trakStart, trakSize, false)
	writeAscii(buf, trakStart + 4, 'trak')

	const tkhdStart = trakStart + 8
	view.setUint32(tkhdStart, tkhdSize, false)
	writeAscii(buf, tkhdStart + 4, 'tkhd')
	buf[tkhdStart + 8] = 0 // version 0
	view.setUint32(tkhdStart + 84, (width << 16) >>> 0, false)
	view.setUint32(tkhdStart + 88, (height << 16) >>> 0, false)

	return buf.buffer
}

function buildSyntheticWav({ channels = 2, sampleRate = 48000, bitsPerSample = 16, durationSeconds = 5 } = {}) {
	const byteRate = sampleRate * channels * (bitsPerSample / 8)
	const dataSize = byteRate * durationSeconds
	const buf = new Uint8Array(44)
	const view = new DataView(buf.buffer)
	writeAscii(buf, 0, 'RIFF')
	view.setUint32(4, 36 + dataSize, true)
	writeAscii(buf, 8, 'WAVE')
	writeAscii(buf, 12, 'fmt ')
	view.setUint32(16, 16, true)
	view.setUint16(20, 1, true) // PCM
	view.setUint16(22, channels, true)
	view.setUint32(24, sampleRate, true)
	view.setUint32(28, byteRate, true)
	view.setUint16(32, channels * (bitsPerSample / 8), true)
	view.setUint16(34, bitsPerSample, true)
	writeAscii(buf, 36, 'data')
	view.setUint32(40, dataSize, true)
	return buf.buffer
}

function buildSyntheticFlac({ sampleRate = 96000, channels = 2, bitsPerSample = 24, totalSamples = 960000 } = {}) {
	const buf = new Uint8Array(42)
	const view = new DataView(buf.buffer)
	writeAscii(buf, 0, 'fLaC')
	buf[4] = 0x80 // last metadata block, type 0 (STREAMINFO)
	buf[5] = 0
	buf[6] = 0
	buf[7] = 34
	// bytes 18..25 pack sampleRate(20), channels-1(3), bps-1(5), totalSamples(36)
	buf[18] = (sampleRate >> 12) & 0xff
	buf[19] = (sampleRate >> 4) & 0xff
	buf[20] = ((sampleRate & 0x0f) << 4) | (((channels - 1) & 0x07) << 1) | (((bitsPerSample - 1) >> 4) & 0x01)
	buf[21] = (((bitsPerSample - 1) & 0x0f) << 4) | 0
	view.setUint32(22, totalSamples, false)
	return buf.buffer
}

function buildSyntheticMp3({ title = 'Demo Track', artist = 'Nextcloud Band', bitrateIdx = 11, sampleIdx = 0 } = {}) {
	const titPayloadLen = 1 + title.length
	const tpePayloadLen = 1 + artist.length
	const tagBodyLen = (10 + titPayloadLen) + (10 + tpePayloadLen)
	const buf = new Uint8Array(10 + tagBodyLen + 8)
	const view = new DataView(buf.buffer)

	writeAscii(buf, 0, 'ID3')
	buf[3] = 3 // v2.3
	buf[4] = 0
	buf[5] = 0
	buf[6] = (tagBodyLen >> 21) & 0x7f
	buf[7] = (tagBodyLen >> 14) & 0x7f
	buf[8] = (tagBodyLen >> 7) & 0x7f
	buf[9] = tagBodyLen & 0x7f

	let pos = 10
	writeAscii(buf, pos, 'TIT2')
	view.setUint32(pos + 4, titPayloadLen, false)
	buf[pos + 10] = 0 // Latin-1
	writeAscii(buf, pos + 11, title)
	pos += 10 + titPayloadLen

	writeAscii(buf, pos, 'TPE1')
	view.setUint32(pos + 4, tpePayloadLen, false)
	buf[pos + 10] = 0
	writeAscii(buf, pos + 11, artist)
	pos += 10 + tpePayloadLen

	// MPEG1 (11) Layer III (01) -> 0xFF 0xFB
	buf[pos] = 0xff
	buf[pos + 1] = 0xfb
	buf[pos + 2] = ((bitrateIdx & 0x0f) << 4) | ((sampleIdx & 0x03) << 2)
	buf[pos + 3] = 0x40 // Joint Stereo (01)
	return buf.buffer
}

function buildSyntheticPdf({ version = '1.7', pages = 12, title = 'Q4 Report', encrypted = false } = {}) {
	const encPart = encrypted ? '\n/Encrypt 5 0 R' : ''
	const raw = `%PDF-${version}\n1 0 obj\n<< /Type /Pages /Count ${pages} >>\nendobj\n2 0 obj\n<< /Title (${title}) /Producer (LibreOffice) ${encPart} >>\nendobj`
	const buf = new Uint8Array(raw.length)
	writeAscii(buf, 0, raw)
	return buf.buffer
}

function loadMediaModules() {
	const visual = loadModule('src/tools/visualMediaInspector.js')
	const media = loadModule('src/tools/mediaContentInspector.js', {
		'./visualMediaInspector': visual,
	})
	return { visual, media }
}

function createDetailsWithMediaInspector() {
	const utils = loadModule('src/tools/utils.js', { './notifications': { showErrorNotification() {} } })
	const pathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const stats = loadModule('src/tools/duplicateStats.js')
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const compare = loadModule('src/tools/duplicateCompare.js', {
		'./duplicatePathDiff': pathDiff,
	})
	const visualInspector = loadModule('src/tools/visualMediaInspector.js')
	const mediaInspector = loadModule('src/tools/mediaContentInspector.js', {
		'./visualMediaInspector': visualInspector,
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
		'../tools/mediaContentInspector': mediaInspector,
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

describe('Cycle 126: Multi-Format Media, Document & Text Content Inspector', () => {
	test('classifies content kinds, sanitizes URLs strictly, and formats duration/audio streams', () => {
		const { media } = loadMediaModules()

		assert.equal(media.classifyInspectableContent({ mimetype: 'video/mp4', path: '/a.mp4' }), 'video')
		assert.equal(media.classifyInspectableContent({ mimetype: 'audio/mpeg', path: '/a.mp3' }), 'audio')
		assert.equal(media.classifyInspectableContent({ mimetype: 'application/pdf', path: '/a.pdf' }), 'pdf')
		assert.equal(media.classifyInspectableContent({ mimetype: 'application/json', path: '/a.json' }), 'text')
		assert.equal(media.classifyInspectableContent({ mimetype: '', path: '/notes/todo.md' }), 'text')
		assert.equal(media.classifyInspectableContent({ mimetype: 'image/jpeg', path: '/a.jpg' }), 'image')
		assert.equal(media.classifyInspectableContent({ mimetype: 'application/octet-stream', path: '/a.bin' }), 'binary')

		assert.equal(media.isContentInspectableFile({ mimetype: 'audio/wav' }), true)
		assert.equal(media.isContentInspectableFile({ mimetype: 'image/png' }), false)
		assert.equal(media.isPlayableMediaKind('video'), true)
		assert.equal(media.isPlayableMediaKind('audio'), true)
		assert.equal(media.isPlayableMediaKind('pdf'), false)

		// Strict URL sanitizer blocks XSS/insecure schemes
		assert.equal(media.sanitizeContentUrl('https://cloud.example.test/remote.php/dav/files/alice/a.mp3'), 'https://cloud.example.test/remote.php/dav/files/alice/a.mp3')
		assert.equal(media.sanitizeContentUrl('/remote.php/dav/files/alice/a.mp3'), '/remote.php/dav/files/alice/a.mp3')
		assert.equal(media.sanitizeContentUrl('javascript:alert(1)'), '')
		assert.equal(media.sanitizeContentUrl('data:text/html,<script>alert(1)</script>'), '')
		assert.equal(media.sanitizeContentUrl('//evil.example/a.mp3'), '')
		assert.equal(media.sanitizeContentUrl('http://insecure.example/a.mp3'), '')

		assert.equal(media.formatMediaDuration(90), '01:30')
		assert.equal(media.formatMediaDuration(3665), '1:01:05')
		assert.equal(media.formatAudioStreamSummary({ channels: 2, sampleRate: 48000, bitsPerSample: 16 }), 'Stereo, 48 kHz, 16-bit')
	})

	test('parses MP4, WAV, FLAC, MP3 (ID3 + MPEG), and PDF headers deterministically without throwing on bad buffers', () => {
		const { media } = loadMediaModules()

		const mp4 = media.parseMediaOrDocumentHeader(buildSyntheticMp4({ brand: 'qt  ', duration: 90000, width: 1920, height: 1080 }))
		assert.equal(mp4.kind, 'video')
		assert.equal(mp4.format, 'MOV')
		assert.equal(mp4.durationFormatted, '01:30')
		assert.equal(mp4.width, 1920)
		assert.equal(mp4.height, 1080)

		const wav = media.parseMediaOrDocumentHeader(buildSyntheticWav({ channels: 2, sampleRate: 48000, bitsPerSample: 16, durationSeconds: 5 }))
		assert.equal(wav.kind, 'audio')
		assert.equal(wav.format, 'WAV (PCM)')
		assert.equal(wav.sampleRate, 48000)
		assert.equal(wav.bitrateKbps, 1536)
		assert.equal(wav.durationFormatted, '00:05')

		const flac = media.parseMediaOrDocumentHeader(buildSyntheticFlac({ sampleRate: 96000, channels: 2, bitsPerSample: 24, totalSamples: 960000 }))
		assert.equal(flac.kind, 'audio')
		assert.equal(flac.format, 'FLAC')
		assert.equal(flac.sampleRate, 96000)
		assert.equal(flac.bitsPerSample, 24)
		assert.equal(flac.durationFormatted, '00:10')

		const mp3 = media.parseMediaOrDocumentHeader(
			buildSyntheticMp3({ title: 'Forest Rain', artist: 'FieldMic', bitrateIdx: 11, sampleIdx: 0 }),
			{ mimetype: 'audio/mpeg', path: '/Music/rain.mp3' },
		)
		assert.equal(mp3.kind, 'audio')
		assert.equal(mp3.format, 'MP3 (ID3v2.3)')
		assert.equal(mp3.title, 'Forest Rain')
		assert.equal(mp3.artist, 'FieldMic')
		assert.equal(mp3.bitrateKbps, 192)
		assert.equal(mp3.sampleRate, 44100)
		assert.equal(mp3.channelLabel, 'Joint Stereo')

		const pdf = media.parseMediaOrDocumentHeader(buildSyntheticPdf({ version: '1.7', pages: 12, title: 'Q4 Report', encrypted: true }))
		assert.equal(pdf.kind, 'pdf')
		assert.equal(pdf.format, 'PDF 1.7')
		assert.equal(pdf.pageCount, 12)
		assert.equal(pdf.title, 'Q4 Report')
		assert.equal(pdf.encrypted, true)

		assert.equal(media.parseMediaOrDocumentHeader(null), null)
		assert.equal(media.parseMediaOrDocumentHeader(new Uint8Array([1, 2, 3])), null)
	})

	test('inspectTextContent, computeTextLineDiff, evaluateMediaContentQuality, and buildContentInspectionDiffRows work accurately', () => {
		const { media } = loadMediaModules()

		const jsonInfo = media.inspectTextContent('{"host":"nextcloud","port":443}\n', { path: '/config.json', mimetype: 'application/json' })
		assert.equal(jsonInfo.kind, 'text')
		assert.equal(jsonInfo.lineEnding, 'LF')
		assert.equal(jsonInfo.structuredSummary, 'JSON Object (2 keys)')

		const csvInfo = media.inspectTextContent('id,name,size\r\n1,doc.pdf,512\r\n', { path: '/report.csv', mimetype: 'text/csv' })
		assert.equal(csvInfo.lineEnding, 'CRLF')
		assert.equal(csvInfo.structuredSummary, '3 cols (,), 3 rows')

		// Reject binary NUL payloads
		assert.equal(media.inspectTextContent(new Uint8Array([0x41, 0x00, 0x42]), { path: '/fake.txt', mimetype: 'text/plain' }), null)

		const diff = media.computeTextLineDiff('line1\nline2\nline3', 'line1\nline2-edited\nline3\nline4')
		assert.equal(diff.summary.identical, false)
		assert.equal(diff.summary.equalLines, 2)
		assert.equal(diff.summary.changedLines, 1)
		assert.equal(diff.summary.addedLines, 1)

		const files = [
			{ id: 1, path: '/Music/song_128.mp3', size: 3000000, mimetype: 'audio/mpeg' },
			{ id: 2, path: '/Music/song_320.mp3', size: 7500000, mimetype: 'audio/mpeg' },
		]
		const parsedByKey = {
			1: { kind: 'audio', format: 'MP3', bitrateKbps: 128, sampleRate: 44100, channels: 2 },
			2: { kind: 'audio', format: 'MP3', bitrateKbps: 320, sampleRate: 48000, channels: 2 },
		}
		const quality = media.evaluateMediaContentQuality(files, parsedByKey)
		assert.equal(quality.hasContentMedia, true)
		assert.equal(quality.hasQualitySpread, true)
		assert.equal(quality.winnerIndex, 1)
		assert.equal(quality.perFile[1].isQualityWinner, true)
		assert.equal(quality.perFile[0].isLowerQuality, true)

		const diffRows = media.buildContentInspectionDiffRows(files[0], files[1], {
			leftParsed: parsedByKey[1],
			rightParsed: parsedByKey[2],
		})
		assert.ok(diffRows.rows.some(r => r.key === 'bitrate' && r.isDiff && r.leftValue === '128 kbps' && r.rightValue === '320 kbps'))
	})

	test('DuplicateDetails & DuplicateCompareView inspect audio streams via Range fetch and sync media playback controls', async () => {
		const Details = createDetailsWithMediaInspector()
		const originalFetch = globalThis.fetch
		const mp3Low = buildSyntheticMp3({ title: 'Podcast Ep 4', artist: 'Host', bitrateIdx: 9, sampleIdx: 0 }) // 128 kbps
		const mp3High = buildSyntheticMp3({ title: 'Podcast Ep 4', artist: 'Host', bitrateIdx: 14, sampleIdx: 1 }) // 320 kbps, 48kHz

		globalThis.fetch = async url => ({
			ok: true,
			arrayBuffer: async () => (String(url).includes('hq') ? mp3High : mp3Low),
		})

		const duplicate = {
			id: 926,
			hash: 'audio-compare-hash',
			acknowledged: false,
			files: [
				{
					id: 501,
					nodeId: 601,
					path: '/alice/files/Podcasts/ep4_lq.mp3',
					size: 3200000,
					mtime: 1700000100,
					mimetype: 'audio/mpeg',
					downloadUrl: 'https://cloud.example.test/remote.php/dav/files/alice/Podcasts/ep4_lq.mp3',
					isInOriginFolder: false,
				},
				{
					id: 502,
					nodeId: 602,
					path: '/alice/files/Podcasts/ep4_hq.mp3',
					size: 8100000,
					mtime: 1700000200,
					mimetype: 'audio/mpeg',
					downloadUrl: 'https://cloud.example.test/remote.php/dav/files/alice/Podcasts/ep4_hq.mp3',
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
			const inspectContentBtn = wrapper.$el.querySelector('.group-header-summary__inspect-content-button')
			assert.ok(inspectContentBtn, 'Inspect media & content button appears for audio duplicate group')
			inspectContentBtn.click()
			await settle()

			const workspace = wrapper.$el.querySelector('.compare-workspace')
			assert.ok(workspace)
			assert.ok(workspace.querySelector('.compare-content-bar'))
			assert.equal(workspace.querySelectorAll('audio.compare-pane__media-audio').length, 2)

			const syncBtn = workspace.querySelector('.compare-sync-media-button')
			assert.ok(syncBtn)
			assert.equal(syncBtn.getAttribute('aria-pressed'), 'true')
			syncBtn.click()
			await settle()
			assert.equal(syncBtn.getAttribute('aria-pressed'), 'false')

			const fetchBtn = workspace.querySelector('.compare-content-fetch-button')
			assert.ok(fetchBtn)
			fetchBtn.click()
			await settle()

			assert.ok(fetchBtn.textContent.includes('Content inspected'))
			assert.ok(workspace.textContent.includes('128 kbps'))
			assert.ok(workspace.textContent.includes('320 kbps'))
			assert.ok(workspace.textContent.includes('Higher quality / metadata'))
		} finally {
			globalThis.fetch = originalFetch
			wrapper.$destroy()
			wrapper.$el.remove()
		}
	})

	test('DuplicateCompareView renders side-by-side text diff safely and blocks XSS payloads', async () => {
		const Details = createDetailsWithMediaInspector()
		const originalFetch = globalThis.fetch
		const xssLine = '<img src=x onerror=alert(1)>'
		const leftBytes = new TextEncoder().encode(`alpha\n${xssLine}\nomega\n`)
		const rightBytes = new TextEncoder().encode(`alpha\n${xssLine}-modified\nomega\nextra\n`)

		globalThis.fetch = async url => ({
			ok: true,
			arrayBuffer: async () => (String(url).includes('copy_b') ? rightBytes.buffer : leftBytes.buffer),
		})

		const duplicate = {
			id: 927,
			hash: 'text-compare-hash',
			acknowledged: false,
			files: [
				{
					id: 601,
					nodeId: 701,
					path: '/alice/files/Docs/copy_a.md',
					size: leftBytes.byteLength,
					mtime: 1700000100,
					mimetype: 'text/markdown',
					downloadUrl: 'https://cloud.example.test/remote.php/dav/files/alice/Docs/copy_a.md',
				},
				{
					id: 602,
					nodeId: 702,
					path: '/alice/files/Docs/copy_b.md',
					size: rightBytes.byteLength,
					mtime: 1700000200,
					mimetype: 'text/markdown',
					downloadUrl: 'https://cloud.example.test/remote.php/dav/files/alice/Docs/copy_b.md',
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
			wrapper.$children[0].openCompareMode()
			await settle()

			const workspace = wrapper.$el.querySelector('.compare-workspace')
			const fetchBtn = workspace.querySelector('.compare-content-fetch-button')
			fetchBtn.click()
			await settle()

			const textStage = workspace.querySelector('.compare-text-diff-stage')
			assert.ok(textStage, 'Side-by-side text diff stage rendered')
			assert.equal(workspace.querySelectorAll('img[src="x"]').length, 0, 'XSS payload must never execute or inject HTML')
			assert.ok(textStage.textContent.includes(xssLine))

			const diffOnlyBtn = workspace.querySelector('.compare-text-diffs-only-button')
			assert.ok(diffOnlyBtn)
			const allRowsCount = textStage.querySelectorAll('tbody tr').length
			assert.equal(allRowsCount, 5)
			diffOnlyBtn.click()
			await settle()
			const changedRowsCount = textStage.querySelectorAll('tbody tr').length
			assert.equal(changedRowsCount, 2)
		} finally {
			globalThis.fetch = originalFetch
			wrapper.$destroy()
			wrapper.$el.remove()
		}
	})

	test('Cycle 126 touched files preserve zero U+2013/U+2014 dashes, zero XSS sinks, logical CSS, and >= 44px mobile touch targets', () => {
		const filesToCheck = [
			'src/tools/mediaContentInspector.js',
			'src/components/DuplicateCompareView.vue',
			'src/components/DuplicateDetails.vue',
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
